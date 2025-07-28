const sqlite3 = require('sqlite3').verbose();
const DB_PATH = './data/database.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) { console.error('Erro ao abrir o banco de dados', err.message); } 
    else { console.log('Conectado ao banco de dados SQLite.'); createTables(); }
});

const createTables = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)`, (err) => {
            if (err) return console.error(err.message);
            db.run(`INSERT OR IGNORE INTO config (key, value) VALUES ('adminPhone', '5500999990000'), ('minOrderValue', '130')`);
        });

        db.run(`CREATE TABLE IF NOT EXISTS customers (
            phone TEXT PRIMARY KEY, cnpj TEXT, address TEXT, city TEXT, state TEXT
        )`);

        // ***** ESTRUTURA DA TABELA DE PRODUTOS ALTERADA *****
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,          -- Preço do pacote
            stock REAL NOT NULL,          -- Quantidade de pacotes em estoque
            contentType TEXT NOT NULL,    -- 'unidade' ou 'peso'
            contentValue REAL NOT NULL    -- Qtd de unidades ou o peso em kg
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS saved_orders (
            customerPhone TEXT, productId INTEGER, quantity REAL, PRIMARY KEY (customerPhone, productId),
            FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, customerPhone TEXT NOT NULL, totalValue REAL NOT NULL,
            status TEXT DEFAULT 'Pendente', createdAt TEXT NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, orderId INTEGER NOT NULL, productId INTEGER,
            productName TEXT NOT NULL, quantity REAL NOT NULL, pricePerUnit REAL NOT NULL,
            FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS persistent_carts (
            customerPhone TEXT, productId INTEGER, quantity REAL, PRIMARY KEY (customerPhone, productId),
            FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS stock_notifications (
            customerPhone TEXT, productId INTEGER, PRIMARY KEY (customerPhone, productId),
            FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
        )`);
    });
};

const dbRun = (sql, params = []) => new Promise((resolve, reject) => { db.run(sql, params, function (err) { if (err) reject(err); else resolve({ changes: this.changes, lastID: this.lastID }); }); });
const dbGet = (sql, params = []) => new Promise((resolve, reject) => { db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); }); });
const dbAll = (sql, params = []) => new Promise((resolve, reject) => { db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); }); });

module.exports = { db, dbRun, dbGet, dbAll };