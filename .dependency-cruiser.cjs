const layers = ['_app', '_pages', 'widgets', 'features', 'entities', 'shared'];
const layerRules = layers.flatMap((layer, index) =>
  index === 0
    ? []
    : [
        {
          name: `${layer}-cannot-import-higher-layers`,
          severity: 'error',
          from: { path: `^src/${layer}/` },
          to: { path: `^src/(${layers.slice(0, index).join('|')})/` },
        },
      ],
);
module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
    ...layerRules,
    ...['_pages', 'widgets', 'features', 'entities'].map((layer) => ({
      name: `${layer}-no-cross-slice-imports`,
      severity: 'error',
      from: { path: `^src/${layer}/([^/]+)/` },
      to: { path: `^src/${layer}/(?!$1/)[^/]+/` },
    })),
    ...['_pages', 'widgets', 'features', 'entities', 'shared'].map((layer) => ({
      name: `${layer}-public-api-only`,
      severity: 'error',
      from: { pathNot: `^src/${layer}/([^/]+)/` },
      to: { path: `^src/${layer}/([^/]+)/`, pathNot: '/index(\\.server)?\\.tsx?$' },
    })),
    {
      name: 'domain-is-framework-independent',
      severity: 'error',
      from: { path: '^src/server/modules/[^/]+/domain/' },
      to: { path: '(node_modules/(next|react|@supabase)/|^src/(?!server/modules/[^/]+/domain/))' },
    },
    {
      name: 'application-does-not-import-infrastructure',
      severity: 'error',
      from: { path: '^src/server/modules/[^/]+/application/' },
      to: { path: '/infrastructure/|node_modules/@supabase/' },
    },
    {
      name: 'ui-cannot-import-server-internals',
      severity: 'error',
      from: { path: '^src/(widgets|features|entities|shared)/' },
      to: { path: '^src/server/|\\.server\\.' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
