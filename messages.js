// messages.js

module.exports = {
    // =================================================================
    // GERAL E UTILITÁRIOS
    // =================================================================
    unregistered_user_warning: "Aviso: O número {senderId} tentou usar o bot, mas não está cadastrado.",
    human_mode_active: "Modo Humano ATIVO para {senderId}. Bot não responderá.",
    generic_error: "Ocorreu um erro. Por favor, tente novamente.",
    invalid_option: "Opção inválida. Por favor, tente novamente.",
    invalid_value: "Valor inválido. Por favor, tente novamente.",
    operation_cancelled: "Operação cancelada.",
    button_options: "Opções",
    button_confirm: "Confirmar",
    button_see_products: "Ver Produtos",
    button_save: "Salvar?",
    button_actions: "Ações",
    
    // =================================================================
    // MENUS
    // =================================================================
    admin_menu_title: "Painel do Administrador",
    admin_menu_section_title: "Gerenciamento",
    customer_menu_welcome: "👋 Olá, {customerName}! Bem-vindo(a) à {companyName}!",
    customer_menu_description: "Selecione uma opção abaixo para começar suas compras.",
    customer_menu_section_title: "Navegação",
    
    // =================================================================
    // FLUXO DO CLIENTE
    // =================================================================
    cart_resume_prompt: "Notei que você tem {itemCount} item(ns) no seu carrinho. Deseja continuar de onde parou?",
    cart_cleared: "Ok, seu carrinho anterior foi esvaziado. Vamos começar um novo!",
    cart_cleared_confirmation: "Prontinho! Seu carrinho foi esvaziado.",
    products_unavailable: "🙁 Poxa, {customerName}, parece que estamos sem produtos no estoque no momento.",
    products_list_header: "Estes são os pacotes disponíveis hoje, {customerName}.",
    products_list_section_title: "Disponíveis Hoje",
    product_selection_prompt: "Ótima escolha, {customerName}! Você selecionou *{productName}*.\n\nAgora, me diga a *quantidade de pacotes* que você deseja:",
    cart_empty: "{customerName}, seu carrinho ainda está vazio. Que tal escolher alguns produtos?",
    cart_view_header: "🛒 *Este é o seu carrinho, {customerName}:*\n\n",
    cart_view_line_item: "• {name}: {quantity} {unit} x R$ {price} = *R$ {subtotal}*\n",
    cart_view_total: "\n*Total: R$ {total}*",
    cart_options_title: "O que deseja fazer agora?",
    order_below_minimum: "Quase lá, {customerName}! Seu pedido está em R$ {cartTotal} e nosso pedido mínimo é de R$ {minOrderValue}. Falta pouco!",
    stock_updated_warning: "Ops, {customerName}! Parece que nosso estoque de *{productName}* foi atualizado. Temos apenas {stock} em estoque agora. Por favor, ajuste a quantidade.",
    order_confirmation: "Perfeito, {customerName}! Seu pedido *#{orderId}* no valor de *R$ {total}* foi confirmado! ✅\n\nJá estamos separando seus produtos. A {companyName} agradece a sua preferência!",
    save_order_prompt: "Deseja salvar este pedido para facilitar suas próximas compras?",
    order_saved_confirmation: "⭐ Ótimo! Seu pedido foi salvo como padrão. Até a próxima!",
    order_not_saved_confirmation: "Sem problemas! Agradecemos novamente e até a próxima!",
    no_saved_order: "{customerName}, você ainda não tem um pedido padrão salvo.",
    saved_order_loaded: "Pronto, {customerName}! Seu pedido padrão foi carregado no carrinho. Clique em 'Ver Carrinho' para conferir e finalizar a compra.",
    out_of_stock_prompt: "Gostaria de ser avisado(a) quando este produto voltar ao estoque?",
    out_of_stock_notification_set: "✅ Combinado, {customerName}! Você será a primeira pessoa a saber quando este produto voltar ao estoque.",
    already_in_waitlist: "Você já está na lista de espera para este produto, {customerName}. Avisaremos assim que chegar!",
    item_added_to_cart: "Prontinho, {customerName}! Adicionei *{quantity} pacote(s) de {productName}*. ✅\n\nSeu carrinho agora tem {itemCount} item(ns), totalizando *R$ {total}*",
    order_history_empty: "Você ainda não fez nenhum pedido conosco, {customerName}.",
    order_history_header: "📜 *Seus últimos 5 pedidos, {customerName}:*\n\n",
    order_history_item_header: "*Pedido #{id}* - {date}\n*Valor:* R$ {value}\n",
    order_history_item_line: "  - {quantity}x {name}\n",
    stock_notification_callback: "🎉 Boas notícias! O produto *{productName}* que você queria está de volta ao estoque!",
    
    // Títulos de Opções de Lista (Cliente)
    list_option_cart_continue: "Sim, continuar comprando",
    list_option_cart_clear_and_restart: "Não, esvaziar e começar de novo",
    list_option_view_products: "🥐 Ver Produtos",
    list_option_view_cart: "🛒 Ver Carrinho",
    list_option_load_saved_order: "⭐ Carregar Pedido Padrão",
    list_option_order_history: "📜 Histórico de Compras",
    list_option_finalize_order: "✅ Finalizar Pedido",
    list_option_add_more_items: "➕ Adicionar Mais Itens",
    list_option_clear_cart: "❌ Esvaziar Carrinho",
    list_option_save_order_yes: "Sim, salvar como pedido padrão",
    list_option_save_order_no: "Não, obrigado(a)",
    list_option_notify_me: "Sim, por favor me avise!",
    list_option_no_thanks: "Não, obrigado.",

    // =================================================================
    // FLUXO DO ADMIN
    // =================================================================
    admin_notification_new_order: "🔔 *Novo Pedido #{orderId}* 🔔\n\n*Cliente:* {customerName} ({phone})\n*CNPJ:* {cnpj}\n*Endereço:* {address}, {city} - {state}\n\n*Itens do Pedido:*\n{items}\n*TOTAL DO PEDIDO: R$ {total}*",
    admin_notification_new_order_item: "• {quantity} {unit} de {name}\n",

    // Admin: Gerenciamento de Clientes
    customer_management_title: "Gerenciar Clientes",
    customer_add_phone_prompt: "Digite o número do cliente (formato DDI+DDD+Numero, ex: 5543999998888).",
    no_customers_to_remove: "Não há clientes para remover.",
    customer_remove_prompt: "Selecione um cliente para remover",
    customer_removed_success: "✅ Cliente {phone} removido com sucesso!",
    customer_add_cnpj_prompt: "Telefone salvo. Agora digite o *CNPJ* do cliente (apenas números):",
    customer_add_manual_prompt: "Ok, vamos para o cadastro manual.\n\nPor favor, digite o *endereço* completo (Rua, Número, Bairro):",
    cnpj_consulting: "Consultando CNPJ: {cnpj}... ⏳",
    cnpj_api_error: "❌ Não foi possível consultar o CNPJ. Vamos seguir com o cadastro manual.\n\nPor favor, digite o *endereço* completo:",
    cnpj_data_found: "*Dados Encontrados:*\n\n*Razão Social:* {razao_social}\n*Endereço:* {address}\n*Município:* {city} / {state}\n\nOs dados estão corretos?",
    cnpj_data_confirmation_title: "Confirmação de Dados",
    customer_add_address_prompt: "Endereço salvo. Qual a *cidade*?",
    customer_add_city_prompt: "Cidade salva. Por último, o *Estado* (sigla, ex: PR):",
    customer_add_success: "✅ Cliente *{razao_social}* cadastrado com sucesso!",
    customer_add_manual_success: "✅ Cliente cadastrado com sucesso (manualmente)!",
    customer_already_exists: "⚠️ Este cliente já está cadastrado.",

    // Admin: Gerenciamento de Produtos
    product_management_title: "Gerenciar Produtos",
    product_add_name_prompt: "Ok, digite o *nome* do novo produto:",
    no_products_registered: "Não há produtos cadastrados.",
    product_select_prompt: "Selecione um Produto",
    product_action_prompt: "O que fazer com {productName}?",
    product_edit_field_prompt: "Ok, digite o novo *{field}* do produto:",
    product_stock_add_prompt: "Ok. Quantos pacotes você quer *adicionar*?",
    product_stock_remove_prompt: "Ok. Quantos pacotes você quer *remover*?",
    confirm_delete_product: "⚠️ *ATENÇÃO!* Tem certeza que quer remover este produto? A ação não pode ser desfeita.\n\nDigite `SIM` para confirmar.",
    product_content_type_prompt: "Como o conteúdo do pacote é medido?",
    product_content_unit_prompt: "Entendido. Quantas *unidades* vêm neste pacote?",
    product_content_weight_prompt: "Entendido. Qual o *peso em kg* deste pacote? (ex: 1.2)",
    product_add_price_prompt: "Nome: *{name}*.\n\nAgora, digite o *preço do pacote*:",
    product_add_stock_prompt: "Preço: *R$ {price}*.\n\nQuantos *pacotes* você tem em estoque?",
    product_add_success: "✅ Produto *{productName}* cadastrado com sucesso!",
    product_update_success: "✅ Nome do produto alterado para *{productName}*.",
    price_update_success: "✅ Preço atualizado para R$ {newPrice}.",
    stock_update_success: "✅ Estoque de *{productName}* atualizado para *{newStock}*.",
    stock_insufficient_to_remove: "Não é possível remover *{quantity}*. Estoque atual: *{stock}*.",
    product_removed_success: "✅ Produto removido com sucesso.",
    stock_notification_sent: "Enviando notificação de volta ao estoque para {count} cliente(s)...",

    // Admin: Relatórios e Configs
    reports_title: "Gerar Relatório",
    report_top_products_header: "🏆 *Top 5 Produtos Mais Vendidos*\n\n",
    report_top_customers_header: "⭐ *Top 5 Clientes*\n\n",
    report_no_data: "Nenhum pedido registrado ainda.",
    min_order_set_prompt: "Digite o *novo valor* do pedido mínimo:",
    min_order_update_success: "✅ Pedido mínimo alterado para *R$ {minOrder}*!",

    // Títulos de Opções de Lista (Admin)
    list_option_admin_manage_products: "📦 Gerenciar Produtos",
    list_option_admin_manage_customers: "👥 Gerenciar Clientes",
    list_option_admin_reports: "📊 Relatórios",
    list_option_admin_config_min_order: "💰 Configurar Pedido Mínimo",
    list_option_customer_add: "Adicionar Cliente",
    list_option_customer_remove: "Remover Cliente",
    list_option_product_add: "➕ Cadastrar Novo Produto",
    list_option_product_edit_remove: "✏️ Editar/Remover Produto Existente",
    list_option_confirm_cnpj_yes: "Sim, cadastrar esta empresa",
    list_option_confirm_cnpj_no: "Não, digitar dados manualmente",
    list_option_edit_field_name: "✏️ Alterar Nome",
    list_option_edit_field_price: "💰 Alterar Preço",
    list_option_stock_add: "➕ Adicionar ao Estoque",
    list_option_stock_remove: "➖ Remover do Estoque",
    list_option_product_delete: "🗑️ Apagar Produto",
    list_option_content_type_unit: "Unidades",
    list_option_content_type_weight: "Peso (kg)",
    list_option_report_top_products: "🏆 Produtos Mais Vendidos",
    list_option_report_top_customers: "⭐ Clientes que Mais Compram"
};