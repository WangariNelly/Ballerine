import react from '@vitejs/plugin-react';
import fg from 'fast-glob';
import tailwindcss from 'tailwindcss';
import dts from 'vite-plugin-dts';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Defines an array of entry points to be used to search for files.
const entryPoints = ['src/components/**/*.ts'];

// Searches for files that match the patterns defined in the array of input points.
// Returns an array of absolute file paths.
const files = fg.sync(entryPoints, { absolute: true });

// Maps the file paths in the "files" array to an array of key-value pair.
const entities = files
  //excluding test files
  .filter(file => Boolean(file.match(/(?<=src\/)(?!.*\.test).*$/)))
  .map(file => {
    // Extract the part of the file path after the "src" folder and before the file extension.
    const [key] = file.match(/(?<=src\/).*$/) || [];

    // Remove the file extension from the key.
    const keyWithoutExt = key.replace(/\.[^.]*$/, '');

    return [keyWithoutExt, file];
  });

// Convert the array of key-value pairs to an object using the Object.fromEntries() method.
// Returns an object where each key is the file name without the extension and the value is the absolute file path.
const entries = Object.fromEntries(entities);
// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5201,
    open: './dev.tsx',
  },
  plugins: [react(), dts({ copyDtsFiles: true }), tailwindcss(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: true,
    environmentOptions: {
      jsdom: {
        resources: 'usable',
        features: {
          // Disable features you don't need
          FetchExternalResources: false,
          ProcessExternalResources: false,
          SkipExternalResources: true,
        },
      },
    },
    // This needed for emblor and react-easy-sort to work during testing.
    deps: {
      inline: [/react-easy-sort/, /emblor/],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: 'inline',
    lib: {
      entry: {
        ...entries,
        index: './src/index.ts',
      },
      formats: ['es'],
      name: 'ui',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'react/jsx-runtime',
        },
      },
    },
    minify: true,
  },
});
