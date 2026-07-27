import next from 'eslint-config-next';

// eslint-config-next ships a native flat config (Next 15+), so we spread it
// directly — no @eslint/eslintrc / FlatCompat shim needed.
export default [{ ignores: ['.next/**', 'node_modules/**'] }, ...next];
