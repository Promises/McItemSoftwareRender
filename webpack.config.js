const path = require('path');
const webpack = require('webpack')
module.exports = {
    entry: './dist/ThreeJsRenderer.js', // Path to your main script
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    mode: 'development',
    resolve: {
        fallback: {
            "path": require.resolve("path-browserify"),
            "fs": false, // You can set this to false as you're not using fs in the browser
            "util": require.resolve("util"),
            "stream": require.resolve("stream-browserify"),
            "zlib": require.resolve("browserify-zlib"),
            "assert": require.resolve("assert"),

            "buffer": require.resolve("buffer")
        }
    },
    plugins: [
        // fix "process is not defined" error:
        new webpack.ProvidePlugin({
            process: 'process/browser',
        }),
    ],
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            },
            {
                test: /\.json$/,
                loader: 'json-loader'
            }
        ]
    }
};
