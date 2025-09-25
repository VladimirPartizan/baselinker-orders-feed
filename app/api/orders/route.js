/*
  Vercel / Next.js API route: /api/orders
  (App Router - file: app/api/orders/route.js)
  --------------------------------------
  Что делает:
  - Запрашивает заказы из BaseLinker через API (connector.php, method=getOrders)
  - Возвращает результат в JSON (по умолчанию) или CSV (если ?format=csv)
  - Поддерживает простые фильтры: date_from, date_to (ISO или UNIX seconds), limit
*/

export const dynamic = 'force-dynamic';

// Вспомогательные функции
function parseDateToUnix(v) {
  if (!v) return NaN;
  if (/^\d+$/.test(String(v))) return Number(v);
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) return NaN;
  return Math.floor(t / 1000);
}

function unixToIso(v) {
  if (!v) return '';
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  return new Date(n * 1000).toISOString();
}

function escapeCsv(s) {
  if (s == null) return '';
  const s2 = String(s).replace(/"/g, '""');
  if (s2.search(/[",\n]/) !== -1) return `"${s2}"`;
  return s2;
}

// Обновленная функция для CSV, где товары раскладываются по столбцам
function ordersToCsv(orders) {
  const header = ['order_id', 'date_confirmed', 'customer_name', 'total_price', 'item_sku', 'item_name', 'item_quantity', 'item_price_brutto'];
  const lines = [header.join(',')];

  for (const o of orders) {
    const baseFields = [
      escapeCsv(o.order_id ?? ''),
      escapeCsv(o.date_confirmed ? unixToIso(o.date_confirmed) : (o.date_add ? unixToIso(o.date_add) : '')),
      escapeCsv((o.customer && (o.customer.name || `${o.customer.first_name || ''} ${o.customer.last_name || ''}`)) || o.customer_name || o.name || ''),
      escapeCsv(o.total_price ?? o.total_brutto ?? o.total ?? '')
    ];

    const items = o.items ?? o.products ?? o.order_products ?? o.order_items ?? [];

    if (items.length === 0) {
      // Нет товаров, добавляем строку с пустыми полями товаров
      lines.push(baseFields.join(',') + ',,,');
    } else {
      for (const item of items) {
        const itemFields = [
          escapeCsv(item.sku ?? ''),
          escapeCsv(item.name ?? ''),
          escapeCsv(item.quantity ?? ''),
          escapeCsv(item.price_brutto ?? '')
        ];
        lines.push(baseFields.join(',') + ',' + itemFields.join(','));
      }
    }
  }

  return lines.join('\n');
}

// Основной обработчик запроса
export async function GET(request) {
  const TOKEN = "8002656-8006681-H4SJ9VECZ4LQBY3U72QHYTU9R8CLA5VZTDGD6GSFXDKCEH3MVPKV2P4AGCPKID8Y";

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');
    const limit = searchParams.get('limit') || '100';

    const paramsObj = {};
    if (date_from) {
      const d = parseDateToUnix(date_from);
      if (!Number.isNaN(d)) paramsObj.date_confirmed_from = d;
    }
    if (date_to) {
      const d = parseDateToUnix(date_to);
      if (!Number.isNaN(d)) paramsObj.date_confirmed_to = d;
    }

    const lim = Number(limit) || 100;
    paramsObj.limit = lim;

    const body = new URLSearchParams();
    body.append('token', TOKEN);
    body.append('method', 'getOrders');
    body.append('parameters', JSON.stringify(paramsObj));

    const resp = await fetch('https://api.baselinker.com/connector.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'Error from BaseLinker', details: data }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const orders = Array.isArray(data.orders) ? data.orders : (Array.isArray(data.result) ? data.result : (Array.isArray(data) ? data : (data && data.orders_list ? data.orders_list : null)));

    if (!orders) {
      return new Response(JSON.stringify({ raw: data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (format.toLowerCase() === 'csv') {
      const csv = ordersToCsv(orders);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename=orders.csv'
        }
      });
    }

    // JSON по умолчанию
    return new Response(JSON.stringify(orders), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Error in /api/orders:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
