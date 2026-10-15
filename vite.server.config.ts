import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    target: 'node24',
    outDir: 'build-api',
    rolldownOptions: {
      input: {
        main: 'src/server/main.ts',
        migrate: 'src/server/migrate.ts',
        createAccount: 'src/server/createAccount.ts',
        seedDemo: 'src/server/seedDemo.ts',
        validation: 'src/server/recordValidation.ts',
      },
      output: { entryFileNames: '[name].js' },
    },
  },
})
