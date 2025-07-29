// =================================================================
// SERVER.JS - VERSÃO FINAL (COM CORREÇÃO DE DATA E E-MAIL)
// =================================================================

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbAll, dbGet, dbRun } = require('./database.js');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const TOKEN_SECRET = 'chave-secreta-para-gerar-tokens-do-seu-sistema-12345';

async function getMercadoPagoClient() {
    try {
        const tokenConfig = await dbGet("SELECT value FROM config WHERE key = 'payment_mercado_pago_token'");
        if (tokenConfig && tokenConfig.value) {
            return new MercadoPagoConfig({ accessToken: tokenConfig.value, options: { timeout: 5000 } });
        }
        console.warn("⚠️ Token do Mercado Pago não encontrado no banco de dados.");
        return null;
    } catch (error) {
        console.error("❌ Erro ao obter token do Mercado Pago do DB:", error);
        return null;
    }
}

function initializeWebServer(wppClient, loadBotMessagesCallback, botMessages) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*" } });

    app.use(cors());
    app.use(express.json({ limit: '5mb' }));
    app.use(express.static('public'));

    // =================================================================
    // ROTAS PÚBLICAS (Não exigem token de login)
    // =================================================================

   app.post('/api/payment-webhook', async (req, res) => {
        const paymentId = req.body.data?.id;
        console.log('Webhook Mercado Pago recebido para pagamento ID:', paymentId);
        
        if (!paymentId) {
            return res.sendStatus(200);
        }

        try {
            const mpClient = await getMercadoPagoClient();
            if (!mpClient) {
                console.error('Webhook recebido, mas cliente Mercado Pago não está configurado.');
                return res.status(503).send('Mercado Pago client not configured.');
            }
            
            const payment = new Payment(mpClient);
            const paymentInfo = await payment.get({ id: paymentId });
            const orderId = paymentInfo.external_reference;
            
            
            if (paymentInfo.status === 'approved') {
                const order = await dbGet(`SELECT * FROM orders WHERE id = ?`, [orderId]);
                const customer = await dbGet(`SELECT name FROM customers WHERE phone = ?`, [order.customerPhone]);

                // CORREÇÃO: Usa o objeto botMessages passado como parâmetro
                const customerMsg = botMessages.payment_successful_customer.replace('{orderId}', orderId);
                await wppClient.sendText(order.customerPhone, customerMsg);

                const adminPhone = (await dbGet(`SELECT value FROM config WHERE key = 'adminPhone'`)).value + '@c.us';
                const adminMsg = botMessages.payment_successful_admin.replace('{orderId}', orderId).replace('{customerName}', customer.name || 'Cliente');
                await wppClient.sendText(adminPhone, adminMsg);

                io.emit('paymentUpdate', { orderId, status: 'approved' });

            } else if (['cancelled', 'expired'].includes(paymentInfo.status)) {
                 const order = await dbGet(`SELECT * FROM orders WHERE id = ?`, [orderId]);
                 const customer = await dbGet(`SELECT name FROM customers WHERE phone = ?`, [order.customerPhone]);
                 
                 const items = await dbAll(`SELECT productId, quantity FROM order_items WHERE orderId = ?`, [orderId]);
                 for(const item of items) {
                     await dbRun('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.productId]);
                 }

                // CORREÇÃO: Usa o objeto botMessages passado como parâmetro
                const customerMsg = botMessages.payment_failed_customer.replace('{orderId}', orderId);
                await wppClient.sendText(order.customerPhone, customerMsg);
                
                const adminPhone = (await dbGet(`SELECT value FROM config WHERE key = 'adminPhone'`)).value + '@c.us';
                const adminMsg = botMessages.payment_failed_admin.replace('{orderId}', orderId).replace('{customerName}', customer.name || 'Cliente');
                await wppClient.sendText(adminPhone, adminMsg);

                io.emit('paymentUpdate', { orderId, status: 'cancelled' });
            }
            res.sendStatus(200);
        } catch (error) {
            console.error('Erro ao processar webhook do Mercado Pago:', error);
            res.sendStatus(500);
        }
    });

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

    app.post('/api/create-payment', async (req, res) => {
        const { orderId, totalValue, customerName, customerPhone } = req.body;
        
        const mpClient = await getMercadoPagoClient();
        if (!mpClient) {
            return res.status(500).json({ message: 'Pagamento não configurado no servidor.' });
        }

        const expirationDate = new Date();
        expirationDate.setMinutes(expirationDate.getMinutes() + 15);
        
        // CORREÇÃO FINAL: Formata a data para o padrão ISO 8601 com fuso horário, exigido pela API.
        const dateOfExpiration = new Date(expirationDate).toISOString().slice(0, -1) + '-03:00';

        const sanitizedPhone = customerPhone.replace('@c.us', '');
        const payerEmail = `cliente-${sanitizedPhone}@yupvendas.com`;

        const paymentRequestBody = {
            transaction_amount: Number(parseFloat(totalValue).toFixed(2)),
            description: `Pedido #${orderId} - YUP`,
            payment_method_id: 'pix',
            payer: {
                email: payerEmail,
                first_name: customerName,
            },
            external_reference: orderId.toString(),
            notification_url: `https://11ff86587832.ngrok-free.app/api/payment-webhook`, // IMPORTANTE: Mantenha sua URL do ngrok aqui
            date_of_expiration: dateOfExpiration // USA A DATA CORRIGIDA
        };

        try {
            console.log("Enviando para o Mercado Pago:", JSON.stringify(paymentRequestBody, null, 2));
            const payment = new Payment(mpClient);
            const result = await payment.create({ body: paymentRequestBody });
            
            await dbRun('UPDATE orders SET paymentId = ? WHERE id = ?', [result.id, orderId]);

            res.json({
                qrCode: result.point_of_interaction.transaction_data.qr_code_base64,
                qrCodeCopy: result.point_of_interaction.transaction_data.qr_code
            });
        } catch (error) {
            console.error("❌ Erro detalhado ao criar pagamento no Mercado Pago:");
            console.error(JSON.stringify(error.cause || error, null, 2));
            res.status(500).json({ message: 'Erro ao gerar cobrança Pix.' });
        }
    });

    // =================================================================
    // ROTAS PRIVADAS (Exigem token de login)
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

    app.use('/api', authenticateToken);
    
    app.put('/api/config/payment', authorizeAdmin, async (req, res) => {
        const { enabled, token } = req.body;
        try {
            await dbRun("UPDATE config SET value = ? WHERE key = 'payment_mercado_pago_enabled'", [String(enabled)]);
            if (token) {
                await dbRun("UPDATE config SET value = ? WHERE key = 'payment_mercado_pago_token'", [token]);
            }
            res.json({ success: true, message: 'Configurações de pagamento salvas.' });
        } catch (error) {
            res.status(500).json({ message: 'Erro ao salvar configurações.' });
        }
    });
    
    app.get('/api/me', (req, res) => res.json(req.user));
    app.get('/api/users', authorizeAdmin, async (req, res) => res.json(await dbAll('SELECT id, username, name, role FROM users')));
    app.post('/api/users', authorizeAdmin, async (req, res) => {
        const { username, password, name, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
        await dbRun('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [username, hashedPassword, name, role]);
        res.status(201).json({ success: true });
    });
     app.put('/api/users/:id', authorizeAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { name, username, role, password } = req.body;
            let query = 'UPDATE users SET name = ?, username = ?, role = ?';
            const params = [name, username, role];
            if (password) {
                const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
                query += ', password = ?';
                params.push(hashedPassword);
            }
            query += ' WHERE id = ?';
            params.push(id);
            await dbRun(query, params);
            res.json({ success: true, message: 'Usuário atualizado com sucesso!' });
        } catch (error) {
            console.error("Erro ao atualizar usuário:", error);
            if (error.code === 'SQLITE_CONSTRAINT') {
                return res.status(409).json({ message: 'Este nome de usuário já está em uso.' });
            }
            res.status(500).json({ message: "Erro interno no servidor." });
        }
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
    app.get('/api/config', authorizeAdmin, async (req, res) => {
        try {
            const configRows = await dbAll("SELECT key, value FROM config");
            const config = configRows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
            res.json(config);
        } catch (err) {
            res.status(500).json({ message: "Erro ao buscar configurações." });
        }
    });
    app.put('/api/config/registration', authorizeAdmin, async (req, res) => {
        const { registration_required } = req.body;
        await dbRun(`UPDATE config SET value = ? WHERE key = 'registration_required'`, [String(registration_required)]);
        res.json({ success: true, message: 'Modo de registro atualizado!' });
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
        (async () => {
            let successCount = 0;
            for (const phone of phones) {
                try {
                    const customer = await dbGet('SELECT name FROM customers WHERE phone = ?', [phone]);
                    const customerName = customer ? customer.name : '';
                    const personalizedMessage = message.replace(/{nome}/g, customerName);
                    await wppClient.sendText(phone, personalizedMessage);
                    successCount++;
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