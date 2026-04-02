import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'tests/webview/**', ...configDefaults.exclude],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        // Declarations and source-embedded test files do not contribute runtime coverage.
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        // Webview-only panel shells are exercised through platform and webview tests, not unit coverage.
        'src/**/ui-panel.ts',
        'src/**/memory-panel.ts',
        // VS Code extension entrypoints require the extension host instead of plain Vitest.
        'src/extension/extension.ts',
        'src/extension/platform-view-provider.ts',
        'src/extension/terminal-panel.ts',
        // These extension helpers are integration-heavy and currently produce low-signal unit coverage.
        'src/extension/commands.ts',
        'src/extension/debug-session-events.ts',
        'src/extension/platform-view-state.ts',
        'src/extension/project-scaffolding.ts',
        'src/extension/rom-sources.ts',
        'src/extension/session-state-manager.ts',
        'src/extension/source-columns.ts',
        'src/extension/workspace-selection.ts',
        // The DAP session is covered by adapter integration tests rather than direct unit coverage.
        'src/debug/adapter.ts',
        // These are barrel/configuration files with negligible runtime branching.
        'src/debug/types.ts',
        'src/debug/index.ts',
        // Runtime orchestrators are still integration-heavy; keep only the concrete files excluded.
        'src/platforms/tec1/runtime.ts',
        'src/platforms/tec1g/runtime.ts',
        // Platform type declarations and clock helpers are structural support code.
        'src/platforms/**/types.ts',
        'src/platforms/serial/bitbang-uart.ts',
        'src/platforms/cycle-clock.ts',
        // Bundled font/ROM lookup data is static and not meaningful for coverage accounting.
        'src/platforms/tec1g/hd44780-a00.ts',
        'src/platforms/tec1g/st7920-font.ts',
        // Core Z80 execution is currently covered through higher-level runtime and adapter tests.
        'src/z80/decode.ts',
        'src/z80/decode-tables.ts',
        'src/z80/cpu.ts',
        'src/z80/runtime.ts',
        'src/z80/types.ts',
        'src/z80/opcode-types.ts',
        // Type-only files have no runtime branches to measure.
        'src/z80/decode-types.ts',
      ],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
});
