const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const dbConfig = {
    host: process.env.DB_HOST || 'db',
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'grafana_db'
};

// MySQLの完全起動を待つリトライ処理付きのDB初期化関数
async function initDB(retries = 5, delay = 5000) {
    while (retries > 0) {
        try {
            console.log(`Attempting to connect to MySQL... (${retries} retries left)`);
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
            console.log('Connected to MySQL and ensured table exists.');
            return;
        } catch (err) {
            console.error('MySQL connection failed:', err.message);
            retries--;
            if (retries === 0) {
                console.error('MySQL connection failed after multiple attempts.');
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

        res.json({ message: 'Weather data saved successfully', data: { city, temp, temp_min, temp_max, humidity, description } });
    } catch (error) {
        console.error('Error fetching weather data:', error.message);
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
});

// MySQLの準備が完了してからサーバーを起動
initDB().then(() => {
    app.listen(3000, () => console.log('Server running on port 3000'));
});
