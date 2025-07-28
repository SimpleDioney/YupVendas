// =================================================================
// SERVER.JS - VERSÃO FINAL (COM CADASTRO DE CLIENTE)
// =================================================================

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbAll, dbGet, dbRun } = require('./database.js');

const TOKEN_SECRET = 'chave-secreta-para-gerar-tokens-do-seu-sistema-12345';

function initializeWebServer(wppClient, loadBotMessagesCallback) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*" } });

    app.use(cors());
    app.use(express.json());
    app.use(express.static('public'));

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

    app.use('/api', authenticateToken);
    app.get('/api/me', (req, res) => res.json(req.user));
    app.get('/api/users', authorizeAdmin, async (req, res) => res.json(await dbAll('SELECT id, username, name, role FROM users')));
    app.post('/api/users', authorizeAdmin, async (req, res) => {
        const { username, password, name, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
        await dbRun('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [username, hashedPassword, name, role]);
        res.status(201).json({ success: true });
    });
    
    app.get('/api/chat/:phone', async (req, res) => res.json(await dbAll(`SELECT * FROM messages WHERE customerPhone = ? ORDER BY timestamp ASC`, [decodeURIComponent(req.params.phone)])));
    app.post('/api/send-message', async (req, res) => {
        const { phone, message, tempId } = req.body;
        let finalMessage = (req.user.role === 'atendente') ? `*${req.user.name}*:\n${message}` : message;
        try {
            await wppClient.sendText(phone, finalMessage);
            const result = await dbRun(`INSERT INTO messages (customerPhone, messageBody, sender) VALUES (?, ?, ?)`, [phone, message, req.user.name]);
            const savedMessage = await dbGet(`SELECT * FROM messages WHERE id = ?`, [result.lastID]);
            io.emit('messageSaved', { ...savedMessage, tempId });
            res.json({ success: true, messageId: result.lastID });
        } catch (error) { res.status(500).json({ success: false, message: 'Erro ao enviar ou salvar mensagem.'}); }
    });

    app.get('/api/customers', async (req, res) => res.json(await dbAll(`SELECT phone, cnpj, name, address, city, state, isHumanMode FROM customers ORDER BY name`)));
    app.post('/api/customers', authorizeAdmin, async (req, res) => {
        const { phone, cnpj, name, address, city, state } = req.body;
        const formattedPhone = phone.replace(/\D/g, '') + '@c.us';
        try {
            await dbRun('INSERT INTO customers (phone, cnpj, name, address, city, state) VALUES (?, ?, ?, ?, ?, ?)', [formattedPhone, cnpj, name, address, city, state]);
            res.status(201).json({ success: true, message: 'Cliente cadastrado com sucesso!' });
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') { return res.status(409).json({ message: 'Este número de telefone já está cadastrado.' }); }
            console.error("Erro ao cadastrar cliente:", error);
            res.status(500).json({ message: 'Erro interno no servidor.' });
        }
    });
    app.put('/api/customers/:phone', async (req, res) => {
        const { name, cnpj, address, city, state } = req.body;
        await dbRun(`UPDATE customers SET name = ?, cnpj = ?, address = ?, city = ?, state = ? WHERE phone = ?`, [name, cnpj, address, city, state, decodeURIComponent(req.params.phone)]);
        res.json({ success: true, message: 'Cliente atualizado!' });
    });
    app.post('/api/customers/toggle-human-mode', async (req, res) => {
        await dbRun(`UPDATE customers SET isHumanMode = ? WHERE phone = ?`, [req.body.isHumanMode, req.body.phone]);
        res.json({ success: true, message: 'Modo de atendimento alterado.' });
    });

    app.get('/api/products', async (req, res) => res.json(await dbAll(`SELECT * FROM products ORDER BY name`)));
    app.post('/api/products/stock', authorizeAdmin, async (req, res) => {
        await dbRun(`UPDATE products SET stock = stock + ? WHERE id = ?`, [req.body.quantity, req.body.id]);
        res.json({ success: true, message: 'Estoque atualizado!' });
    });
    app.post('/api/products', authorizeAdmin, async (req, res) => {
        const { name, price, stock, contentType, contentValue } = req.body;
        await dbRun(`INSERT INTO products (name, price, stock, contentType, contentValue) VALUES (?, ?, ?, ?, ?)`, [name, price, stock, contentType, contentValue]);
        res.status(201).json({ success: true, message: 'Produto adicionado!' });
    });
    app.put('/api/products/:id', authorizeAdmin, async (req, res) => {
        await dbRun(`UPDATE products SET name = ?, price = ? WHERE id = ?`, [req.body.name, req.body.price, req.params.id]);
        res.json({ success: true, message: 'Produto atualizado!' });
    });

    app.get('/api/messages', async (req, res) => {
        try {
            const messagesList = await dbAll("SELECT key, content FROM bot_messages");
            res.json(messagesList.reduce((acc, row) => ({ ...acc, [row.key]: row.content }), {}));
        } catch (err) { res.status(500).json({ message: "Erro ao buscar mensagens." }); }
    });
    
    app.put('/api/messages', authorizeAdmin, async (req, res) => {
        try {
            for (const [key, content] of Object.entries(req.body)) {
                await dbRun("UPDATE bot_messages SET content = ? WHERE key = ?", [content, key]);
            }
            if (loadBotMessagesCallback) loadBotMessagesCallback();
            res.json({ success: true, message: 'Mensagens atualizadas com sucesso!' });
        } catch (err) { res.status(500).json({ message: "Erro ao atualizar mensagens." }); }
    });

    app.get('/api/dashboard-stats', async (req, res) => {
        const [totalSales, orderCount, productCount, customerCount] = await Promise.all([dbGet(`SELECT SUM(totalValue) as total FROM orders`), dbGet(`SELECT COUNT(id) as count FROM orders`), dbGet(`SELECT COUNT(id) as count FROM products`), dbGet(`SELECT COUNT(phone) as count FROM customers`)]);
        res.json({ totalSales: totalSales.total || 0, orderCount: orderCount.count || 0, productCount: productCount.count || 0, customerCount: customerCount.count || 0 });
    });

    app.get('/api/orders', async (req, res) => res.json(await dbAll(`SELECT o.id, o.customerPhone, o.totalValue, o.createdAt, c.cnpj, c.name FROM orders o LEFT JOIN customers c ON o.customerPhone = c.phone ORDER BY o.createdAt DESC`)));
    app.get('/api/orders/:id', async (req, res) => res.json(await dbAll(`SELECT productName, quantity, pricePerUnit FROM order_items WHERE orderId = ?`, [req.params.id])));

    app.post('/api/campaign/send', authorizeAdmin, async (req, res) => {
        const { phones, message } = req.body;
        if (!phones || phones.length === 0 || !message) {
            return res.status(400).json({ message: 'Telefones e mensagem são obrigatórios.' });
        }

        res.json({ success: true, message: `Campanha iniciada para ${phones.length} cliente(s).` });
        
        // Executa a campanha em segundo plano
        (async () => {
            let successCount = 0;
            for (const phone of phones) {
                try {
                    // 1. Busca os dados do cliente para personalizar a mensagem
                    const customer = await dbGet('SELECT name FROM customers WHERE phone = ?', [phone]);
                    const customerName = customer ? customer.name : ''; // Fallback se não tiver nome

                    // 2. Substitui as variáveis na mensagem
                    const personalizedMessage = message.replace(/{nome}/g, customerName);

                    // 3. Envia a mensagem personalizada
                    await wppClient.sendText(phone, personalizedMessage);
                    successCount++;
                    // Pausa para evitar bloqueio
                    await new Promise(resolve => setTimeout(resolve, 2500)); 
                } catch (err) { 
                    console.error(`Falha na campanha para ${phone}:`, err.message); 
                }
            }
            const adminPhone = (await dbGet(`SELECT value FROM config WHERE key = 'adminPhone'`)).value + '@c.us';
            await wppClient.sendText(adminPhone, `✅ Campanha finalizada! ${successCount} de ${phones.length} mensagens enviadas com sucesso.`);
        })();
    });

    app.get('/api/reports/top-products', authorizeAdmin, async (req, res) => res.json(await dbAll(`SELECT productName, SUM(quantity) as total_sold FROM order_items GROUP BY productName ORDER BY total_sold DESC LIMIT 5`)));
    app.get('/api/reports/top-customers', authorizeAdmin, async (req, res) => res.json(await dbAll(`SELECT o.customerPhone, c.name, COUNT(o.id) as total_orders, SUM(o.totalValue) as total_spent FROM orders o LEFT JOIN customers c ON o.customerPhone = c.phone GROUP BY o.customerPhone ORDER BY total_spent DESC LIMIT 5`)));

    io.on('connection', (socket) => {
      console.log('Painel conectado via WebSocket:', socket.id);
      socket.on('disconnect', () => console.log('Painel desconectado:', socket.id));
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => console.log(`Painel de controle acessível em http://localhost:${PORT}/login.html`));

    return io;
}

module.exports = { initializeWebServer };