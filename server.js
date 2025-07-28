// =================================================================
// SERVER.JS - VERSÃO FINAL V6.2 (100% COMPLETO E SIMPLIFICADO)
// =================================================================

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db, dbAll, dbGet, dbRun } = require('./database.js');
const { startWebServer, server, io, appWrapper } = require('./server.js');


const TOKEN_SECRET = 'chave-secreta-para-gerar-tokens-do-seu-sistema-12345';

function initializeWebServer(wppClient) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*" } });

    app.use(cors());
    app.use(express.json());
    
    // --- ROTAS PÚBLICAS E ARQUIVOS ESTÁTICOS ---
    // Serve todos os arquivos na pasta 'public' (index.html, dashboard.js, etc.)
    app.use(express.static('public'));

    // =================================================================
    // ROTA DE LOGIN (pública)
    // =================================================================
    app.post('/api/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
            if (!user) return res.status(401).json({ message: 'Usuário ou senha inválidos.' });

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) return res.status(401).json({ message: 'Usuário ou senha inválidos.' });

            const tokenPayload = { id: user.id, name: user.name, role: user.role };
            const token = jwt.sign(tokenPayload, TOKEN_SECRET, { expiresIn: '8h' });
            res.json({ token });
        } catch (error) {
            console.error("Erro no login:", error);
            res.status(500).json({ message: "Erro interno no servidor." });
        }
    });

    // =================================================================
    // MIDDLEWARE DE AUTENTICAÇÃO
    // =================================================================
    const authenticateToken = (req, res, next) => {
        const authHeader = req.header('Authorization');
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.sendStatus(401);
        jwt.verify(token, TOKEN_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    };
    
    const authorizeAdmin = (req, res, next) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Acesso negado.' });
        }
        next();
    };

    // =================================================================
    // ROTAS PROTEGIDAS DA API
    // =================================================================
    
    // Aplica o middleware de autenticação a todas as rotas que começam com /api
    app.use('/api', authenticateToken);
    
    app.get('/api/me', (req, res) => res.json(req.user));
    
    // --- ROTAS DE USUÁRIOS ---
    app.get('/api/users', authorizeAdmin, async (req, res) => {
        const users = await dbAll('SELECT id, username, name, role FROM users');
        res.json(users);
    });

    app.post('/api/users', authorizeAdmin, async (req, res) => {
        const { username, password, name, role } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await dbRun('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [username, hashedPassword, name, role]);
        res.status(201).json({ success: true });
    });
    
    // --- ROTAS DE CHAT E MENSAGENS ---
    app.get('/api/chat/:phone', async (req, res) => {
        const customerPhone = decodeURIComponent(req.params.phone);
        const messages = await dbAll(`SELECT * FROM messages WHERE customerPhone = ? ORDER BY timestamp ASC`, [customerPhone]);
        res.json(messages);
    });

    app.post('/api/send-message', async (req, res) => {
        const { phone, message, tempId } = req.body;
        const loggedInUser = req.user;
        let finalMessage = message;
        if (loggedInUser.role === 'atendente') {
            finalMessage = `*${loggedInUser.name}*:\n${message}`;
        }
        
        try {
            await wppClient.sendText(phone, finalMessage);
            const result = await dbRun(`INSERT INTO messages (customerPhone, messageBody, sender) VALUES (?, ?, ?)`, [phone, message, loggedInUser.name]);
            const savedMessage = await dbGet(`SELECT * FROM messages WHERE id = ?`, [result.lastID]);
            io.emit('messageSaved', { ...savedMessage, tempId });
            res.json({ success: true, messageId: result.lastID });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro ao enviar ou salvar mensagem.'});
        }
    });

    // --- ROTAS DE CLIENTES ---
    app.get('/api/customers', async (req, res) => {
        const customers = await dbAll(`SELECT phone, cnpj, name, address, city, state, isHumanMode FROM customers ORDER BY name`);
        res.json(customers);
    });

    app.put('/api/customers/:phone', async (req, res) => {
        const { name, cnpj, address, city, state } = req.body;
        const customerPhone = decodeURIComponent(req.params.phone);
        await dbRun(`UPDATE customers SET name = ?, cnpj = ?, address = ?, city = ?, state = ? WHERE phone = ?`, [name, cnpj, address, city, state, customerPhone]);
        res.json({ success: true, message: 'Cliente atualizado!' });
    });

    app.post('/api/customers/toggle-human-mode', async (req, res) => {
        const { phone, isHumanMode } = req.body;
        await dbRun(`UPDATE customers SET isHumanMode = ? WHERE phone = ?`, [isHumanMode, phone]);
        res.json({ success: true, message: 'Modo de atendimento alterado.' });
    });

    // --- ROTAS DE PRODUTOS ---
    app.get('/api/products', async (req, res) => {
        const products = await dbAll(`SELECT * FROM products ORDER BY name`);
        res.json(products);
    });

    app.post('/api/products/stock', async (req, res) => {
        const { id, quantity } = req.body;
        await dbRun(`UPDATE products SET stock = stock + ? WHERE id = ?`, [quantity, id]);
        res.json({ success: true, message: 'Estoque atualizado!' });
    });
    
    app.post('/api/products', authorizeAdmin, async (req, res) => {
        const { name, price, stock, contentType, contentValue } = req.body;
        await dbRun(`INSERT INTO products (name, price, stock, contentType, contentValue) VALUES (?, ?, ?, ?, ?)`, [name, price, stock, contentType, contentValue]);
        res.status(201).json({ success: true, message: 'Produto adicionado!' });
    });

    app.put('/api/products/:id', authorizeAdmin, async (req, res) => {
        const { name, price } = req.body;
        await dbRun(`UPDATE products SET name = ?, price = ? WHERE id = ?`, [name, price, req.params.id]);
        res.json({ success: true, message: 'Produto atualizado!' });
    });

    // --- ROTAS DE DASHBOARD, PEDIDOS, CAMPANHAS E RELATÓRIOS ---
    app.get('/api/dashboard-stats', async (req, res) => {
        const totalSales = await dbGet(`SELECT SUM(totalValue) as total FROM orders`);
        const orderCount = await dbGet(`SELECT COUNT(id) as count FROM orders`);
        const productCount = await dbGet(`SELECT COUNT(id) as count FROM products`);
        const customerCount = await dbGet(`SELECT COUNT(phone) as count FROM customers`);
        res.json({ totalSales: totalSales.total || 0, orderCount: orderCount.count || 0, productCount: productCount.count || 0, customerCount: customerCount.count || 0 });
    });

    app.get('/api/orders', async (req, res) => {
        const orders = await dbAll(`SELECT o.id, o.customerPhone, o.totalValue, o.createdAt, c.cnpj, c.name FROM orders o LEFT JOIN customers c ON o.customerPhone = c.phone ORDER BY o.createdAt DESC`);
        res.json(orders);
    });

    app.get('/api/orders/:id', async (req, res) => {
        const items = await dbAll(`SELECT productName, quantity, pricePerUnit FROM order_items WHERE orderId = ?`, [req.params.id]);
        res.json(items);
    });

    app.post('/api/campaign/send', authorizeAdmin, async (req, res) => {
        const { phones, message } = req.body;
        res.json({ success: true, message: `Campanha iniciada para ${phones.length} cliente(s).` });
        (async () => {
            let successCount = 0;
            for (const phone of phones) {
                try {
                    await wppClient.sendText(phone, message);
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 2500));
                } catch (err) { console.error(`Falha na campanha para ${phone}:`, err.message); }
            }
            const adminPhone = (await dbGet(`SELECT value FROM config WHERE key = 'adminPhone'`)).value + '@c.us';
            await wppClient.sendText(adminPhone, `✅ Campanha finalizada! ${successCount} de ${phones.length} mensagens enviadas.`);
        })();
    });

    app.get('/api/reports/top-products', authorizeAdmin, async (req, res) => {
        const topProducts = await dbAll(`SELECT productName, SUM(quantity) as total_sold FROM order_items GROUP BY productName ORDER BY total_sold DESC LIMIT 5`);
        res.json(topProducts);
    });

    app.get('/api/reports/top-customers', authorizeAdmin, async (req, res) => {
        const topCustomers = await dbAll(`SELECT o.customerPhone, c.name, COUNT(o.id) as total_orders, SUM(o.totalValue) as total_spent FROM orders o LEFT JOIN customers c ON o.customerPhone = c.phone GROUP BY o.customerPhone ORDER BY total_spent DESC LIMIT 5`);
        res.json(topCustomers);
    });

    // =================================================================
    // INICIALIZAÇÃO DO SERVIDOR E WEBSOCKET
    // =================================================================
    io.on('connection', (socket) => {
      console.log('Painel conectado via WebSocket:', socket.id);
      socket.on('disconnect', () => console.log('Painel desconectado:', socket.id));
    });

    const PORT = 3000;
    server.listen(PORT, () => {
        console.log(`Painel de controle V6 acessível em http://localhost:${PORT}/login.html`);
    });

    return io;
}

module.exports = { initializeWebServer };