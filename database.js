// database.js (Versão Definitiva - Copie e cole todo este conteúdo)

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./data/database.db', (err) => {
    if (err) {
        console.error('Erro CRÍTICO ao conectar ao banco de dados:', err.message);
        throw err;
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(async () => {
        console.log('Iniciando verificação e criação das tabelas...');

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT,
            role TEXT NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS customers (
            phone TEXT PRIMARY KEY,
            cnpj TEXT,
            name TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            isHumanMode BOOLEAN DEFAULT FALSE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            price REAL,
            stock INTEGER,
            contentType TEXT,
            contentValue REAL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerPhone TEXT,
            totalValue REAL,
            createdAt DATETIME
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orderId INTEGER,
            productId INTEGER,
            productName TEXT,
            quantity INTEGER,
            pricePerUnit REAL
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS persistent_carts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerPhone TEXT,
            productId INTEGER,
            quantity INTEGER
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS saved_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerPhone TEXT,
            productId INTEGER,
            quantity INTEGER
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS stock_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerPhone TEXT,
            productId INTEGER,
            UNIQUE(customerPhone, productId)
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        // Tabela para HISTÓRICO DE CHAT
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerPhone TEXT,
            messageBody TEXT,
            sender TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabela para TEXTOS CUSTOMIZÁVEIS DO BOT
        db.run(`CREATE TABLE IF NOT EXISTS bot_messages (
            key TEXT PRIMARY KEY,
            content TEXT NOT NULL
        )`);

        console.log('Estrutura das tabelas verificada.');

        // Seeding (dados iniciais)
        try {
            await dbRun("INSERT OR IGNORE INTO config (key, value) VALUES ('adminPhone', '5511999999999')");
            await dbRun("INSERT OR IGNORE INTO config (key, value) VALUES ('minOrderValue', '50')");

            await dbRun("INSERT OR IGNORE INTO config (key, value) VALUES ('registration_required', 'true')");

            const adminUser = await dbGet('SELECT * FROM users WHERE role = ?', ['admin']);
            if (!adminUser) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash('admin', salt);
                await dbRun('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', ['admin', hashedPassword, 'Administrador', 'admin']);
                console.log('Usuário "admin" padrão criado com a senha "admin". Por favor, altere-a no painel.');
            }
        } catch (seedError) {
            console.error("Erro ao inserir dados iniciais:", seedError);
        }
    });
}

// Funções de Promise para o DB (dbRun, dbGet, dbAll)
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

module.exports = { db, dbRun, dbGet, dbAll };