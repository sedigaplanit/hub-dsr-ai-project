const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')
const dotenv = require('dotenv')

const rootDir = path.resolve(__dirname, '..', '..')
const sharedDir = path.resolve(__dirname, '../../packages/shared/src')
const envPath = path.resolve(rootDir, '.env')
const envConfig = dotenv.config({ path: envPath })

const resolvedApiUrl =
  process.env.WEB_API_URL || envConfig.parsed?.WEB_API_URL || '/api'

module.exports = (_env, argv = {}) => {
  const isProd = argv.mode === 'production'
  const resolvedPublicPath =
    process.env.WEB_PUBLIC_PATH || envConfig.parsed?.WEB_PUBLIC_PATH || (isProd ? 'auto' : '/')

  return {
    entry: path.resolve(__dirname, 'src/main.tsx'),
    output: {
      filename: isProd ? 'assets/[name].[contenthash].js' : 'assets/[name].js',
      chunkFilename: isProd ? 'assets/[name].[contenthash].js' : 'assets/[name].js',
      path: path.resolve(__dirname, 'dist'),
      publicPath: resolvedPublicPath,
      clean: true
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      alias: {
        '@shared': sharedDir
      }
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          include: [path.resolve(__dirname, 'src'), sharedDir],
          use: {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: path.resolve(__dirname, 'tsconfig.app.json')
            }
          }
        },
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: 'asset/resource',
          generator: {
            filename: 'assets/[name]-[hash][ext][query]'
          }
        }
      ]
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.WEB_API_URL': JSON.stringify(resolvedApiUrl)
      }),
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'public/index.html'),
        inject: 'body',
        minify: isProd
      })
    ],
    devtool: isProd ? 'source-map' : 'eval-source-map',
    devServer: {
      static: {
        directory: path.resolve(__dirname, 'public')
      },
      historyApiFallback: true,
      allowedHosts: 'all',
      hot: true,
      host: '0.0.0.0',
      port: 5173,
      client: {
        overlay: true
      },
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true
        }
      }
    },
    stats: 'minimal',
    infrastructureLogging: {
      level: 'warn'
    },
    performance: {
      hints: false
    }
  }
}
