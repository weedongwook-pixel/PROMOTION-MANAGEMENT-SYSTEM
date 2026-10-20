// Prints SQL only; never connects to or writes a database.
// Default: read-only audit. --migration: print an atomic seed UPDATE for review.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function staticBaselines() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/item-master.js'), 'utf8'), context);
  return ['105', '106', '109'].map(cat => ({
    cat,
    baseline: Math.max(0, ...context.window.PC_ITEM_MASTER
      .map(row => String(row.itemCode || '').trim())
      .filter(code => new RegExp('^' + cat + '\\d{3,}$').test(code))
      .map(code => Number(code.slice(3)))),
  }));
}

function sql(migration = false) {
  const seeds = staticBaselines();
  const cte = `WITH
static_seed(cat, baseline) AS (VALUES ${seeds.map(s => `('${s.cat}',${s.baseline})`).join(',')}),
counter AS (
  SELECT v FROM promo_store WHERE k='pc_code_counter_v1'
    AND json_valid(v)
    AND json_type(v,'$.types')='object'
    AND json_type(v,'$.reservations')='object'
    AND COALESCE(json_type(v,'$.cats'),'null') IN ('null','object')
),
tokens(code) AS (
  SELECT trim(CAST(j.atom AS TEXT)) FROM promo_store p,
    json_tree(CASE WHEN json_valid(p.v) THEN p.v ELSE '{}' END) j
    WHERE j.type IN ('text','integer')
      AND (
        ((p.k LIKE 'promo::c::%' OR p.k IN ('promo::meta','pc_mock_store_v28','pc_itemset_comp','pc_product_promo'))
          AND j.key IN ('itemCode','codeItemSet','itemPromotion','builderCode','itemPromo'))
        OR (p.k='pc_code_counter_v1' AND j.key='code' AND j.path LIKE '$.reservations.%'
          AND json_extract(p.v,j.path||'.type')='item')
        OR (p.k IN ('promo::meta','pc_mock_store_v28') AND j.key='code'
          AND j.path LIKE '$.npd[%].items[%]')
        OR (p.k='pc_itemset_comp' AND j.key='code')
      )
  UNION ALL
  SELECT trim(CAST(j.key AS TEXT)) FROM promo_store p,
    json_tree(CASE WHEN json_valid(p.v) THEN p.v ELSE '{}' END) j
    WHERE p.k IN ('pc_itemset_comp','pc_product_promo')
      AND j.path='$' AND j.key IS NOT NULL
),
live AS (
  SELECT substr(code,1,3) cat, MAX(CAST(substr(code,4) AS INTEGER)) highwater
  FROM tokens WHERE length(code) BETWEEN 6 AND 13
    AND code NOT GLOB '*[^0-9]*' AND substr(code,1,3) IN ('105','106','109')
  GROUP BY substr(code,1,3)
),
highwater AS (
  SELECT s.cat,s.baseline static_baseline,COALESCE(l.highwater,0) live_highwater,
    json_extract(c.v,'$.cats."'||s.cat||'".seeded') previous_seeded,
    MAX(s.baseline,COALESCE(l.highwater,0),
      COALESCE(CAST(json_extract(c.v,'$.cats."'||s.cat||'".cursor') AS INTEGER),0),
      COALESCE(CAST(json_extract(c.v,'$.cats."'||s.cat||'".baseline') AS INTEGER),0)) cursor
  FROM static_seed s CROSS JOIN counter c LEFT JOIN live l ON l.cat=s.cat
)`;
  if (!migration) return cte + '\nSELECT *,cat||printf(\'%03d\',cursor+1) next_code FROM highwater ORDER BY cat;\n';
  const changes = seeds.map(({ cat }) => `
    '$.cats."${cat}"',json_set(
      COALESCE(json_extract(v,'$.cats."${cat}"'),'{}'),
      '$.cursor',(SELECT cursor FROM highwater WHERE cat='${cat}'),
      '$.baseline',(SELECT cursor FROM highwater WHERE cat='${cat}'),
      '$.seeded',json('true'),'$.freed',json('[]'))`).join(',');
  return cte + `
UPDATE promo_store SET
  v=json_set(json_set(v,'$.cats',json(COALESCE(json_extract(v,'$.cats'),'{}'))),${changes}),
  updated_at=MAX(updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000)
WHERE k='pc_code_counter_v1' AND (SELECT COUNT(*) FROM highwater)=3;
`;
}

module.exports = { staticBaselines, sql };
if (require.main === module) process.stdout.write(sql(process.argv.includes('--migration')));
