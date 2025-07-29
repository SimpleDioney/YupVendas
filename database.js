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
            createdAt DATETIME,
            paymentId TEXT 
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
        
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerPhone TEXT,
            messageBody TEXT,
            sender TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS bot_messages (
            key TEXT PRIMARY KEY,
            content TEXT NOT NULL
        )`);

        // CORREÇÃO: Usando db.all para garantir que 'columns' seja um array.
        db.all("PRAGMA table_info(orders)", (err, columns) => {
            if (err) {
                console.error("Erro ao verificar a estrutura da tabela 'orders':", err);
                return;
            }
            if (columns && !columns.find(c => c.name === 'paymentId')) {
                db.run("ALTER TABLE orders ADD COLUMN paymentId TEXT", (alterErr) => {
                    if (alterErr) console.error("Erro ao adicionar coluna 'paymentId':", alterErr);
                });
            }
        });

        console.log('Estrutura das tabelas verificada.');

        // Seeding (dados iniciais)
        try {
            await dbRun("INSERT OR IGNORE INTO config (key, value) VALUES ('adminPhone', '5511999999999')");
            await dbRun("INSERT OR IGNORE INTO config (key, value) VALUES ('minOrderValue', '0')");
            await dbRun("INSERT OR IGNORE INTO config (key, value) VALUES ('registration_required', 'true')");
            await dbRun("INSERT OR IGNORE INTO config (key, value) VALUES ('payment_mercado_pago_enabled', 'false')");
            await dbRun("INSERT OR IGNORE INTO config (key, value) VALUES ('payment_mercado_pago_token', '')");


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