const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const InlineChunkHtmlPlugin = require('inline-chunk-html-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return [
    // Plugin main thread (sandbox code.ts -> code.js)
    {
      name: 'plugin',
      entry: './src/plugin/code.ts',
      output: {
        filename: 'code.js',
        path: path.resolve(__dirname, 'dist'),
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/,
          },
        ],
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js'],
        alias: {
          '@shared': path.resolve(__dirname, 'src/shared'),
          '@plugin': path.resolve(__dirname, 'src/plugin'),
        },
      },
      devtool: isProduction ? false : 'inline-source-map',
      target: 'web',
    },
    // Plugin UI (React iframe -> ui.html with inlined JS/CSS)
    {
      name: 'ui',
      entry: './src/ui/index.tsx',
      output: {
        filename: 'ui.js',
        path: path.resolve(__dirname, 'dist'),
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/,
          },
          {
            test: /\.css$/,
            use: ['style-loader', 'css-loader'],
          },
        ],
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        alias: {
          '@shared': path.resolve(__dirname, 'src/shared'),
          '@ui': path.resolve(__dirname, 'src/ui'),
          '@vlm': path.resolve(__dirname, 'src/vlm'),
        },
      },
      plugins: [
        new HtmlWebpackPlugin({
          template: './src/ui/index.html',
          filename: 'ui.html',
          chunks: ['main'],
          inject: 'body',
          inlineSource: '.(js|css)$',
        }),
        new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/ui/]),
      ],
      devtool: isProduction ? false : 'inline-source-map',
      target: 'web',
    },
  ];
};
