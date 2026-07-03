import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier/recommended';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['**/backend/**', '**/*.cjs', '**/*.mjs'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    prettierConfig,
    prettierPlugin,
    {
        plugins: {
            import: importPlugin,
            'unused-imports': unusedImports,
        },
        rules: {
            'import/order': [
                'error',
                {
                    'newlines-between': 'always',
                    alphabetize: { order: 'asc', caseInsensitive: true },
                },
            ],
            'unused-imports/no-unused-imports': 'error',
        },
    }
);
