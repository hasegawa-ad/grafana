require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');

const app = express();
app.use(express.json());

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

if (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.database) {
    throw new Error('環境変数にデータベースの設定が不足しています');
}

// MySQLの完全起動を待つリトライ処理付きのDB初期化関数
async function initDB(retries = 5, delay = 5000) {
    while (retries > 0) {
        try {
            const connection = await mysql.createConnection(dbConfig);

            await connection.execute(`
                CREATE TABLE IF NOT EXISTS weather_data (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    city VARCHAR(255),
                    temperature FLOAT,
                    temp_min FLOAT,
                    temp_max FLOAT,
                    humidity INT,
                    description VARCHAR(255),
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await connection.end();
            return;
        } catch (err) {
            console.error('MySQLへの接続に失敗しました:', err.message);
            retries--;
            if (retries === 0) {
                console.error('複数回の接続試行後、MySQLへの接続に失敗しました');
                process.exit(1);
            }
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

// OpenWeather APIからデータ取得
app.get('/fetch-weather', async (req, res) => {
    const city = req.query.city || 'Tokyo';
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

    try {
        const response = await axios.get(url);
        const { temp, humidity, temp_min, temp_max } = response.data.main;
        const description = response.data.weather[0].description;

        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            `INSERT INTO weather_data (city, temperature, temp_min, temp_max, humidity, description) VALUES (?, ?, ?, ?, ?, ?)`,
            [city, temp, temp_min, temp_max, humidity, description]
        );
        await connection.end();

        res.json({ message: '天気データが正常に保存されました', data: { city, temp, temp_min, temp_max, humidity, description } });
    } catch (error) {
        console.error('天気データの取得に失敗しました:', error.message);
        res.status(500).json({ error: '天気データの取得に失敗しました' });
    }
});

// MySQLの準備が完了してからサーバーを起動
initDB().then(() => {
    app.listen(3000, () => {
        console.log('サーバーがポート3000で実行中');
    }).on('error', (err) => {
        console.error('サーバーの起動に失敗しました:', err.message);
        process.exit(1);
    });
});
