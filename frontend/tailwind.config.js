/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 与 index.css 中 OKLCH 令牌保持一致（技术方案第 2 节主色）
        // <alpha-value> 使 bg-x/10、ring-x/25 等透明度修饰符可用
        paper: 'oklch(0.985 0.003 160 / <alpha-value>)',
        'paper-deep': 'oklch(0.962 0.006 160 / <alpha-value>)',
        surface: 'oklch(1 0 0 / <alpha-value>)',
        ink: 'oklch(0.27 0.025 155 / <alpha-value>)',
        'ink-soft': 'oklch(0.4 0.028 155 / <alpha-value>)',
        cinnabar: {
          DEFAULT: 'oklch(0.46 0.135 33 / <alpha-value>)',
          deep: 'oklch(0.4 0.12 33 / <alpha-value>)',
        },
        inkgreen: {
          DEFAULT: 'oklch(0.36 0.055 158 / <alpha-value>)',
          deep: 'oklch(0.3 0.05 158 / <alpha-value>)',
        },
        bronze: 'oklch(0.49 0.065 78 / <alpha-value>)',
        bluegray: 'oklch(0.45 0.025 235 / <alpha-value>)',
        line: 'oklch(0.89 0.008 160 / <alpha-value>)',
        danger: 'oklch(0.5 0.16 25 / <alpha-value>)',
        warning: 'oklch(0.62 0.12 70 / <alpha-value>)',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', '"Songti SC"', 'SimSun', 'serif'],
        sans: [
          '"Noto Sans SC"',
          '"Source Han Sans SC"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [],
}
