import obsidianmd from 'eslint-plugin-obsidianmd';

// Match the community scanner: Obsidian policy errors block publication;
// general lint findings stay visible as warnings. Strict tsc remains a gate.
const recommended = obsidianmd.configs.recommended.map(config => ({
  ...config,
  ...(config.rules ? {
    rules: Object.fromEntries(Object.entries(config.rules).map(([name, rule]) => {
      if (name.startsWith('obsidianmd/')) return [name, rule];
      const levels = Array.isArray(rule) ? [...rule] : [rule];
      if (levels[0] === 'error' || levels[0] === 2) levels[0] = 'warn';
      return [name, Array.isArray(rule) ? levels : levels[0]];
    })),
  } : {}),
}));

export default [
  ...recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
