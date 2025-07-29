// =================================================================
// DASHBOARD.JS - VERSÃO FINAL (COM CADASTRO DE CLIENTE E CORREÇÕES)
// =================================================================

document.addEventListener('DOMContentLoaded', async () => {

    // 1. VERIFICAÇÃO DE AUTENTICAÇÃO E SETUP INICIAL
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const authFetch = (url, options = {}) => {
        const headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
        if (options.body) { headers['Content-Type'] = 'application/json'; }
        return fetch(url, { ...options, headers });
    };

    let loggedInUser;
    try {
        const response = await authFetch('/api/me');
        if (!response.ok) throw new Error('Token inválido ou expirado.');
        loggedInUser = await response.json();
    } catch (error) {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
        return;
    }

    // 2. SETUP DA UI, WEBSOCKETS E VARIÁVEIS GLOBAIS
    let allCustomers = [];
    let currentCustomer = null;
    let audioUnlocked = false;

    const customerModal = new bootstrap.Modal(document.getElementById('customerModal'));
    const productModal = new bootstrap.Modal(document.getElementById('productModal'));
    const orderDetailsModal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
    const userModal = new bootstrap.Modal(document.getElementById('userModal'));
    const toastEl = document.getElementById('liveToast');
    const toast = new bootstrap.Toast(toastEl);

    const messagingPlaceholder = document.getElementById('messaging-placeholder');
    const messagingArea = document.getElementById('messaging-area');
    const notificationSound = document.getElementById('notification-sound');
    const chatTabButton = document.querySelector('button[data-bs-target="#messaging-tab-pane"]');

    const socket = io(window.location.origin);

    socket.on('connect', () => console.log('Conectado ao servidor via WebSocket:', socket.id));
    socket.on('newMessage', (message) => handleNewMessage(message));
    socket.on('messageSaved', (savedMessage) => {
        const pendingMsg = document.getElementById(`msg-${savedMessage.tempId}`);
        if (pendingMsg) {
            pendingMsg.id = `msg-${savedMessage.id}`;
            pendingMsg.classList.remove('opacity-50');
        }
    });

    document.getElementById('welcome-user').textContent = `Olá, ${loggedInUser.name}!`;
    if (loggedInUser.role === 'admin') {
        document.getElementById('reports-tab-li').style.display = 'block';
        document.getElementById('users-tab-li').style.display = 'block';
        document.getElementById('campaigns-tab-li').style.display = 'block';
        document.getElementById('settings-tab-li').style.display = 'block';
        document.getElementById('add-customer-tab-li').style.display = 'block';
        document.getElementById('add-product-button').style.display = 'block';
        document.getElementById('products-actions-header').style.display = 'table-cell';
    }

    function unlockAudio() {
        if (audioUnlocked) return;
        notificationSound.play().then(() => {
            notificationSound.pause();
            notificationSound.currentTime = 0;
            audioUnlocked = true;
            document.body.removeEventListener('click', unlockAudio);
        }).catch(e => {});
    }
    document.body.addEventListener('click', unlockAudio);

    const emojiButton = document.getElementById('emoji-button');
    const messageInput = document.getElementById('message-text');
    const picker = new EmojiButton({ trigger: emojiButton, position: 'top-start' });
    picker.on('emoji', selection => {
        messageInput.value += selection.emoji;
        messageInput.focus();
    });

    // 3. FUNÇÕES DE UI E NOTIFICAÇÃO
    function showToast(message, title = 'Notificação', isError = false) {
        document.getElementById('toast-title').textContent = title;
        document.getElementById('toast-body').textContent = message;
        toastEl.className = isError ? 'toast bg-danger text-white' : 'toast bg-success text-white';
        toast.show();
    }

    function showNotification() {
        notificationSound.play().catch(e => console.log("Interação do usuário necessária para tocar som."));
        if (document.hidden) { document.title = `(1) Nova Mensagem! - Painel YUP`; }
        if (!chatTabButton.classList.contains('active')) { chatTabButton.classList.add('blinking-border'); }
    }

    function handleNewMessage(message) {
        if (currentCustomer && currentCustomer.phone === message.customerPhone) {
            appendMessageToChat(message);
        }
        showNotification();
    }

    function appendMessageToChat(msg, isPending = false) {
        const chatBox = document.getElementById('chat-box');
        if (!chatBox) return;
        const shouldScroll = chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 20;
        const msgDiv = document.createElement('div');
        msgDiv.id = `msg-${isPending ? msg.tempId : msg.id}`;
        msgDiv.className = `chat-message ${msg.sender === 'customer' ? 'customer' : 'admin'}`;
        if (isPending) msgDiv.classList.add('opacity-50');
        msgDiv.textContent = msg.messageBody;
        const time = document.createElement('small');
        time.textContent = `${msg.sender} - ${new Date(msg.timestamp || Date.now()).toLocaleString('pt-BR', { timeStyle: 'short' })}`;
        msgDiv.appendChild(time);
        chatBox.appendChild(msgDiv);
        if (shouldScroll) chatBox.scrollTop = chatBox.scrollHeight;
    }

    // 4. FUNÇÕES DE CARREGAMENTO DE DADOS (API)
    async function loadConfig() {
        if (loggedInUser.role !== 'admin') return;
        try {
            const response = await authFetch('/api/config');
            const config = await response.json();
            
            const registrationToggle = document.getElementById('registration-required-toggle');
            if (registrationToggle) {
                registrationToggle.checked = (config.registration_required === 'true');
            }
            
            const mpToggle = document.getElementById('mp-enabled-toggle');
            if (mpToggle) {
                mpToggle.checked = (config.payment_mercado_pago_enabled === 'true');
            }
            const mpTokenInput = document.getElementById('mp-token-input');
            if (mpTokenInput) {
                mpTokenInput.value = config.payment_mercado_pago_token || ''; 
            }

        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
        }
    }

    async function loadAllData() {
        const promises = [loadStats(), loadProducts(), loadOrders(), loadCustomers()];
        if (loggedInUser.role === 'admin') {
            promises.push(loadReports(), loadUsers(), setupMessagesForm(), setupCampaignTemplates(), loadConfig());
        }
        await Promise.all(promises);
    }

    async function loadStats() {
        try {
            const response = await authFetch('/api/dashboard-stats');
            const stats = await response.json();
            document.getElementById('total-sales').textContent = `R$ ${(stats.totalSales || 0).toFixed(2)}`;
            document.getElementById('order-count').textContent = stats.orderCount || 0;
            document.getElementById('product-count').textContent = stats.productCount || 0;
            document.getElementById('customer-count').textContent = stats.customerCount || 0;
        } catch (error) { console.error('Erro ao carregar estatísticas:', error); }
    }

    async function loadProducts() {
        try {
            const response = await authFetch('/api/products');
            const products = await response.json();
            const productsTableBody = document.getElementById('products-table-body');
            productsTableBody.innerHTML = '';
            products.forEach(p => {
                const row = document.createElement('tr');
                const adminActions = loggedInUser.role === 'admin' ? `<button class="btn btn-sm btn-primary" onclick="openProductModal(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.price})"><i class="fa-solid fa-pen-to-square"></i> Editar</button>` : '';
                row.innerHTML = `<td>${p.name}</td><td>R$ ${p.price.toFixed(2)}</td><td><div class="input-group"><button class="btn btn-outline-danger btn-sm" onclick="updateStockWrapper(${p.id}, -1)">-</button><input type="number" class="form-control" placeholder="Qtd" style="max-width: 70px;" id="stock-input-${p.id}"><button class="btn btn-outline-success btn-sm" onclick="updateStockWrapper(${p.id}, 1)">+</button></div></td><td><span class="badge text-bg-secondary">${p.stock}</span></td><td class="products-actions-cell" style="display: ${loggedInUser.role === 'admin' ? 'table-cell' : 'none'};">${adminActions}</td>`;
                productsTableBody.appendChild(row);
            });
        } catch (error) { console.error('Erro ao carregar produtos:', error); }
    }

    async function loadOrders() {
        try {
            const response = await authFetch('/api/orders');
            const orders = await response.json();
            const ordersTableBody = document.getElementById('orders-table-body');
            ordersTableBody.innerHTML = '';
            orders.forEach(o => {
                const row = document.createElement('tr');
                row.innerHTML = `<td>#${o.id}</td><td>${new Date(o.createdAt).toLocaleDateString('pt-BR')}</td><td>${o.name || o.customerPhone.replace('@c.us', '')}</td><td>R$ ${o.totalValue.toFixed(2)}</td><td><button class="btn btn-sm btn-info" onclick="openOrderDetails(${o.id})"><i class="fa-solid fa-eye"></i> Ver</button></td>`;
                ordersTableBody.appendChild(row);
            });
        } catch (error) { console.error('Erro ao carregar pedidos:', error); }
    }

    async function loadCustomers() {
        try {
            const response = await authFetch('/api/customers');
            allCustomers = await response.json();
            renderCustomerLists();
        } catch (error) { console.error('Erro ao carregar clientes:', error); }
    }

    async function loadReports() {
        if (loggedInUser.role !== 'admin') return;
        try {
            const [productsRes, customersRes] = await Promise.all([authFetch('/api/reports/top-products'), authFetch('/api/reports/top-customers')]);
            const topProducts = await productsRes.json();
            const topCustomers = await customersRes.json();
            document.getElementById('top-products-list').innerHTML = topProducts.map(p => `<li class="list-group-item d-flex justify-content-between align-items-center">${p.productName} <span class="badge bg-primary">${p.total_sold}</span></li>`).join('');
            document.getElementById('top-customers-list').innerHTML = topCustomers.map(c => `<li class="list-group-item d-flex justify-content-between align-items-center">${c.name || c.customerPhone.replace('@c.us', '')} <span class="badge bg-success">R$ ${c.total_spent.toFixed(2)}</span></li>`).join('');
        } catch (error) { console.error('Erro ao carregar relatórios:', error); }
    }

    async function loadUsers() {
        if (loggedInUser.role !== 'admin') return;
        try {
            const response = await authFetch('/api/users');
            const users = await response.json();
            document.getElementById('users-table-body').innerHTML = users.map(u => `<tr><td>${u.name}</td><td>${u.username}</td><td><span class="badge ${u.role === 'admin' ? 'text-bg-warning' : 'text-bg-info'}">${u.role}</span></td><td><button class="btn btn-sm btn-primary" onclick="openUserModal(${u.id}, '${u.name}', '${u.username}', '${u.role}')">Editar</button></td></tr>`).join('');
        } catch (error) { console.error('Erro ao carregar usuários:', error); }
    }
    

    function setupCampaignTemplates() {
        const templateSelect = document.getElementById('campaign-template-select');
        const messageTextarea = document.getElementById('campaign-message');

        if (!templateSelect || !messageTextarea) return;

        const templates = {
            "saudacao": "Olá, {nome}! Tudo bem?",
            "promocao": "Olá, {nome}! Temos uma promoção especial para você esta semana. Não perca!",
            "aviso": "Prezado(a) {nome}, informamos que estaremos fechados no próximo feriado. Boas festas!",
            "estoque": "Oi, {nome}! Aquele produto que você queria voltou ao estoque. Aproveite antes que acabe!",
        };

        for (const key in templates) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key.charAt(0).toUpperCase() + key.slice(1);
            templateSelect.appendChild(option);
        }

        templateSelect.addEventListener('change', () => {
            const selectedKey = templateSelect.value;
            if (selectedKey && templates[selectedKey]) {
                messageTextarea.value = templates[selectedKey];
            } else {
                messageTextarea.value = '';
            }
        });
    }

    async function setupMessagesForm() {
        const messagesForm = document.getElementById('messages-form');
        if (!messagesForm) return;
        try {
            const response = await authFetch('/api/messages');
            if (!response.ok) throw new Error('Falha ao buscar mensagens da API.');
            const messages = await response.json();
            messagesForm.querySelectorAll('textarea[name], input[type="text"][name]').forEach(field => {
                if (messages[field.name]) {
                    field.value = messages[field.name];
                }
            });
        } catch (error) {
            showToast('Não foi possível carregar as mensagens customizáveis.', 'Erro', true);
            console.error('Erro ao carregar mensagens:', error);
        }
        messagesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(messagesForm);
            const updatedMessages = Object.fromEntries(formData.entries());
            try {
                const response = await authFetch('/api/messages', { method: 'PUT', body: JSON.stringify(updatedMessages) });
                if (!response.ok) throw new Error('Falha ao salvar');
                showToast('Mensagens do bot atualizadas com sucesso!', 'Sucesso');
            } catch (error) {
                showToast('Erro ao salvar as mensagens.', 'Erro', true);
            }
        });
    }

    function renderCustomerLists(filter = '') {
        const lowerCaseFilter = filter.toLowerCase();
        const filteredCustomers = allCustomers.filter(c => (c.name && c.name.toLowerCase().includes(lowerCaseFilter)) || c.phone.includes(filter));
        const customerListEl = document.getElementById('customer-list');
        customerListEl.innerHTML = filteredCustomers.map(c => `<a class="list-group-item list-group-item-action" id="customer-list-item-${c.phone}" href="#" data-phone="${c.phone}"><strong>${c.name || 'Sem nome'}</strong><br><small class="text-muted">${c.phone.replace('@c.us', '')}</small></a>`).join('');
        document.querySelectorAll('#customer-list a').forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const phone = link.getAttribute('data-phone');
                const customer = allCustomers.find(c => c.phone === phone);
                if (customer) displayChat(customer);
            });
        });
        if (loggedInUser.role === 'admin') {
            const campaignCustomerListEl = document.getElementById('campaign-customer-list');
            campaignCustomerListEl.innerHTML = allCustomers.map(c => `<div class="form-check"><input class="form-check-input" type="checkbox" value="${c.phone}" id="camp-cust-${c.phone}"><label class="form-check-label" for="camp-cust-${c.phone}">${c.name || 'Sem nome'} (${c.phone.replace('@c.us', '')})</label></div>`).join('');
        }
    }

    // 5. FUNÇÕES GLOBAIS
    window.openProductModal = (id = null, name = '', price = '') => {
        document.getElementById('product-form').reset();
        document.getElementById('product-id').value = id;
        document.getElementById('product-name').value = name;
        document.getElementById('product-price').value = price;
        document.getElementById('productModalTitle').textContent = id ? 'Editar Produto' : 'Novo Produto';
        document.getElementById('new-product-fields').style.display = id ? 'none' : 'block';
        productModal.show();
    };
    window.updateStockWrapper = async (id, multiplier) => {
        const input = document.getElementById(`stock-input-${id}`);
        const quantity = parseInt(input.value);
        if (isNaN(quantity) || quantity <= 0) { return showToast('Insira uma quantidade positiva válida no campo.', 'Atenção', true); }
        try {
            await authFetch(`/api/products/stock`, { method: 'POST', body: JSON.stringify({ id, quantity: quantity * multiplier }) });
            showToast('Estoque atualizado!', 'Sucesso');
            loadProducts();
            input.value = '';
        } catch (error) { showToast(`Erro ao atualizar estoque: ${error.message}`, 'Erro', true); }
    };
    window.openOrderDetails = async (orderId) => {
        try {
            const response = await authFetch(`/api/orders/${orderId}`);
            const items = await response.json();
            document.getElementById('orderDetailsModalTitle').textContent = `Detalhes do Pedido #${orderId}`;
            const itemsList = document.getElementById('order-items-list');
            itemsList.innerHTML = items.length ? items.map(item => `<li class="list-group-item d-flex justify-content-between align-items-center">${item.productName}<span class="badge bg-primary rounded-pill">${item.quantity} x R$ ${item.pricePerUnit.toFixed(2)}</span></li>`).join('') : '<li class="list-group-item">Nenhum item encontrado.</li>';
            orderDetailsModal.show();
        } catch (error) { showToast(`Erro ao buscar detalhes: ${error.message}`, 'Erro', true); }
    };
    window.openCustomerModal = () => {
        if (!currentCustomer) return;
        document.getElementById('customer-form').reset();
        document.getElementById('customer-name-edit').value = currentCustomer.name || '';
        document.getElementById('customer-cnpj-edit').value = currentCustomer.cnpj || '';
        document.getElementById('customer-address-edit').value = currentCustomer.address || '';
        document.getElementById('customer-city-edit').value = currentCustomer.city || '';
        document.getElementById('customer-state-edit').value = currentCustomer.state || '';
        customerModal.show();
    };
    window.openUserModal = (id = null, name = '', username = '', role = 'atendente') => {
        document.getElementById('user-form').reset();
        document.getElementById('user-id').value = id;
        document.getElementById('user-name').value = name;
        document.getElementById('user-username').value = username;
        document.getElementById('user-role').value = role;
        document.getElementById('userModalTitle').textContent = id ? 'Editar Usuário' : 'Novo Usuário';
        document.getElementById('user-password').required = !id;
        userModal.show();
    };
    window.displayChat = async (customer) => {
        document.querySelectorAll('.customer-list a').forEach(el => el.classList.remove('active'));
        document.getElementById(`customer-list-item-${customer.phone}`).classList.add('active');
        currentCustomer = customer;
        messagingPlaceholder.classList.add('d-none');
        messagingArea.classList.remove('d-none');
        document.getElementById('selected-customer-phone').value = customer.phone;
        document.getElementById('chat-customer-name').textContent = customer.name || customer.phone.replace('@c.us', '');
        const toggle = document.getElementById('human-mode-toggle');
        const label = document.getElementById('human-mode-label');
        toggle.checked = customer.isHumanMode;
        label.textContent = customer.isHumanMode ? 'Modo Humano' : 'Modo Bot';
        label.className = `form-check-label fw-bold ${customer.isHumanMode ? 'text-danger' : 'text-success'}`;
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = 'Carregando histórico...';
        try {
            const response = await authFetch(`/api/chat/${encodeURIComponent(customer.phone)}`);
            const messages = await response.json();
            chatBox.innerHTML = '';
            messages.forEach(msg => appendMessageToChat(msg));
            chatBox.scrollTop = chatBox.scrollHeight;
        } catch (e) { chatBox.innerHTML = '<div class="text-center text-danger">Erro ao carregar histórico.</div>' }
    };
    window.selectAllCustomers = (checked) => document.querySelectorAll('#campaign-customer-list .form-check-input').forEach(c => c.checked = checked);

    // 6. EVENT LISTENERS
    document.getElementById('logout-button').addEventListener('click', () => {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    });
    
    document.getElementById('consult-cnpj-btn').addEventListener('click', async () => {
        const cnpjInput = document.getElementById('new-customer-cnpj');
        const cnpj = cnpjInput.value.replace(/\D/g, '');
        if (cnpj.length !== 14) { return showToast('Por favor, digite um CNPJ válido com 14 dígitos.', 'Erro', true); }
        const button = document.getElementById('consult-cnpj-btn');
        const spinner = button.querySelector('.spinner-border');
        button.disabled = true;
        spinner.classList.remove('d-none');
        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            if (!response.ok) { throw new Error('CNPJ não encontrado ou inválido.'); }
            const data = await response.json();
            document.getElementById('new-customer-name').value = data.razao_social || '';
            const fullAddress = `${data.descricao_tipo_de_logradouro || ''} ${data.logradouro || ''}, ${data.numero || ''} - ${data.bairro || ''}`.trim();
            document.getElementById('new-customer-address').value = fullAddress;
            document.getElementById('new-customer-city').value = data.municipio || '';
            document.getElementById('new-customer-state').value = data.uf || '';
            showToast('Dados do CNPJ preenchidos!', 'Sucesso');
        } catch (error) {
            showToast(error.message, 'Erro na Consulta', true);
        } finally {
            button.disabled = false;
            spinner.classList.add('d-none');
        }
    });

    document.getElementById('add-customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            phone: document.getElementById('new-customer-phone').value,
            cnpj: document.getElementById('new-customer-cnpj').value.replace(/\D/g, ''),
            name: document.getElementById('new-customer-name').value,
            address: document.getElementById('new-customer-address').value,
            city: document.getElementById('new-customer-city').value,
            state: document.getElementById('new-customer-state').value
        };
        if (!body.phone || !body.name) { return showToast('Telefone e Nome são obrigatórios.', 'Atenção', true); }
        try {
            const response = await authFetch('/api/customers', { method: 'POST', body: JSON.stringify(body) });
            const result = await response.json();
            if (!response.ok) { throw new Error(result.message); }
            showToast(result.message, 'Sucesso');
            e.target.reset();
            loadCustomers();
        } catch (error) {
            showToast(error.message, 'Erro ao Cadastrar', true);
        }
    });

    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('product-id').value;
        const isEditing = !!id;
        const url = isEditing ? `/api/products/${id}` : '/api/products';
        const method = isEditing ? 'PUT' : 'POST';
        let body = { name: document.getElementById('product-name').value, price: parseFloat(document.getElementById('product-price').value) };
        if (!isEditing) { Object.assign(body, { stock: parseInt(document.getElementById('product-stock').value), contentType: document.getElementById('product-contentType').value, contentValue: parseFloat(document.getElementById('product-contentValue').value) }); }
        try {
            const response = await authFetch(url, { method, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(await response.text());
            showToast(`Produto ${isEditing ? 'atualizado' : 'adicionado'}!`, 'Sucesso');
            productModal.hide();
            await Promise.all([loadProducts(), loadStats()]);
        } catch (error) { showToast(`Erro ao salvar produto: ${error.message}`, 'Erro', true); }
    });

    document.getElementById('customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { name: document.getElementById('customer-name-edit').value, cnpj: document.getElementById('customer-cnpj-edit').value, address: document.getElementById('customer-address-edit').value, city: document.getElementById('customer-city-edit').value, state: document.getElementById('customer-state-edit').value };
        try {
            await authFetch(`/api/customers/${encodeURIComponent(currentCustomer.phone)}`, { method: 'PUT', body: JSON.stringify(body) });
            showToast('Cliente atualizado!', 'Sucesso');
            customerModal.hide();
            const oldPhone = currentCustomer.phone;
            await loadCustomers();
            const updatedCustomer = allCustomers.find(c => c.phone === oldPhone);
            if (updatedCustomer) displayChat(updatedCustomer);
        } catch (error) { showToast(`Erro ao atualizar cliente: ${error.message}`, 'Erro', true); }
    });

    document.getElementById('user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('user-id').value;
        const password = document.getElementById('user-password').value;
        const isEditing = !!id;
        let body = { name: document.getElementById('user-name').value, username: document.getElementById('user-username').value, role: document.getElementById('user-role').value };
        if (password) { body.password = password; }
        else if (!isEditing) { return showToast('A senha é obrigatória para novos usuários.', 'Erro', true); }
        const url = isEditing ? `/api/users/${id}` : '/api/users';
        const method = isEditing ? 'PUT' : 'POST';
        try {
            const response = await authFetch(url, { method, body: JSON.stringify(body) });
            if (!response.ok) throw new Error((await response.json()).message);
            showToast(`Usuário ${isEditing ? 'atualizado' : 'criado'}!`, 'Sucesso');
            userModal.hide();
            loadUsers();
        } catch (error) { showToast(`Erro ao salvar usuário: ${error.message}`, 'Erro', true); }
    });

    // CORREÇÃO: Lógica para salvar os toggles movida para event listeners individuais
    const registrationToggle = document.getElementById('registration-required-toggle');
    if (registrationToggle) {
        registrationToggle.addEventListener('change', async (e) => {
            const isRequired = e.target.checked;
            try {
                await authFetch(`/api/config/registration`, {
                    method: 'PUT',
                    body: JSON.stringify({ registration_required: isRequired })
                });
                showToast(`Modo de acesso alterado.`, 'Sucesso');
            } catch (error) {
                showToast(`Erro ao alterar modo de acesso: ${error.message}`, 'Erro', true);
                e.target.checked = !isRequired; // Reverte o toggle em caso de erro
            }
        });
    }

    const saveMpBtn = document.getElementById('save-mp-settings-btn');
    if (saveMpBtn) {
        saveMpBtn.addEventListener('click', async () => {
            const isEnabled = document.getElementById('mp-enabled-toggle').checked;
            const token = document.getElementById('mp-token-input').value;

            if (isEnabled && !token) {
                return showToast('Para ativar o pagamento, o Access Token é obrigatório.', 'Erro', true);
            }

            try {
                await authFetch('/api/config/payment', {
                    method: 'PUT',
                    body: JSON.stringify({
                        enabled: isEnabled,
                        token: token
                    })
                });
                showToast('Configurações de pagamento salvas com sucesso!', 'Sucesso');
            } catch (error) {
                showToast(`Erro ao salvar configurações: ${error.message}`, 'Erro', true);
            }
        });
    }

    document.getElementById('send-message-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageInput = document.getElementById('message-text');
        if (!currentCustomer || !messageInput.value) return;
        const tempId = Date.now();
        const optimisticMessage = { tempId, customerPhone: currentCustomer.phone, messageBody: messageInput.value, sender: loggedInUser.name, timestamp: Date.now() };
        appendMessageToChat(optimisticMessage, true);
        const originalMessage = messageInput.value;
        messageInput.value = '';
        try {
            const response = await authFetch(`/api/send-message`, { method: 'POST', body: JSON.stringify({ phone: currentCustomer.phone, message: originalMessage, tempId }) });
            if (!response.ok) throw new Error('Falha no envio');
        } catch (error) {
            showToast(`Erro ao enviar: ${error.message}`, 'Erro', true);
            const failedMsg = document.getElementById(`msg-${tempId}`);
            if (failedMsg) failedMsg.classList.add('bg-danger');
        }
    });

    document.getElementById('human-mode-toggle').addEventListener('change', async (e) => {
        if (!currentCustomer) return;
        const isHumanMode = e.target.checked;
        try {
            await authFetch(`/api/customers/toggle-human-mode`, { method: 'POST', body: JSON.stringify({ phone: currentCustomer.phone, isHumanMode }) });
            showToast(`Modo de atendimento alterado.`, 'Aviso');
            const label = document.getElementById('human-mode-label');
            label.textContent = isHumanMode ? 'Modo Humano' : 'Modo Bot';
            label.className = `form-check-label fw-bold ${isHumanMode ? 'text-danger' : 'text-success'}`;
            currentCustomer.isHumanMode = isHumanMode;
        } catch (error) { showToast(`Erro ao alterar modo: ${error.message}`, 'Erro', true); }
    });

    document.getElementById('campaign-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = document.getElementById('campaign-message').value;
        const phones = Array.from(document.querySelectorAll('#campaign-customer-list .form-check-input:checked')).map(cb => cb.value);
        if (phones.length === 0 || !message) { return showToast('Selecione clientes e digite uma mensagem.', 'Atenção', true); }
        if (!confirm(`Enviar uma mensagem para ${phones.length} cliente(s)?`)) return;
        try {
            const response = await authFetch(`/api/campaign/send`, { method: 'POST', body: JSON.stringify({ phones, message }) });
            const result = await response.json();
            showToast(result.message, 'Campanha Iniciada');
            e.target.reset();
            selectAllCustomers(false);
        } catch (error) { showToast(`Erro na campanha: ${error.message}`, 'Erro', true); }
    });

    document.getElementById('customer-search-input').addEventListener('input', (e) => renderCustomerLists(e.target.value));

    window.onfocus = () => { document.title = 'Painel - YUP'; };
    chatTabButton.addEventListener('click', () => { chatTabButton.classList.remove('blinking-border'); });

    // 7. CARREGAMENTO INICIAL
    loadAllData();
});