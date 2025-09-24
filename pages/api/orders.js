/*
  Vercel / Next.js API route: /api/orders
  --------------------------------------
  Что делает:
  - Запрашивает заказы из BaseLinker через API (connector.php, method=getOrders)
  - Возвращает результат в JSON (по умолчанию) или CSV (если ?format=csv)
  - Поддерживает простые фильтры: date_from, date_to (ISO или UNIX seconds), limit

  Пререквизиты:
  - У тебя должен быть API-ключ BaseLinker (внутри кабинета BaseLinker -> Мой аккаунт -> API)
  - В Vercel в настройках проекта нужно добавить переменную окружения:
      BASELINKER_API_TOKEN = "твой_ключ_из_baselinker"

  Как разместить:
  1) Создай проект Next.js (или используй существующий), положи этот файл в /pages/api/orders.js
  2) Запушь в GitHub и подключи проект к Vercel
  3) В Vercel добавь env var BASELINKER_API_TOKEN
  4) Деплой — и endpoint будет:
       https://<твoй-проект>.vercel.app/api/orders

  Примеры запросов к твоему фиду:
  - JSON (всё):
      GET https://<проект>.vercel.app/api/orders
  - С фильтром по дате (ISO):
      GET https://<проект>.vercel.app/api/orders?date_from=2025-09-01&limit=200
  - CSV:
      GET https://<проект>.vercel.app/api/orders?format=csv&date_from=2025-09-01

  Прямой вызов BaseLinker (пример, если хочешь протестировать локально):
    curl -X POST https://api.baselinker.com/connector.php \
      -d "token=ВАШ_API_TOKEN" \
      -d "method=getOrders" \
      -d "parameters={\"date_confirmed_from\":1696118400}"

  Примечания:
  - BaseLinker ожидает параметры дат в UNIX (seconds). Здесь мы принимаем ISO-строки и конвертируем в UNIX автоматически.
  - Если структура ответа BaseLinker в вашей учетной записи отличается, в коде есть простая попытка найти массив заказов (data.orders || data.result || data).
  - CSV-экспорт упрощённый: в одну ячейку записываются позиции заказа в виде JSON-строки.
*/

// Next.js / Vercel API route
export default async function handler(req, res) {
  const TOKEN = process.env.8002656-8006681-H4SJ9VECZ4LQBY3U72QHYTU9R8CLA5VZTDGD6GSFXDKCEH3MVPKV2P4AGCPKID8Y;
  if (!TOKEN) {
    return res.status(500).json({ error: '8002656-8006681-H4SJ9VECZ4LQBY3U72QHYTU9R8CLA5VZTDGD6GSFXDKCEH3MVPKV2P4AGCPKID8Y not set in environment' });
  }

  try {
    const { format = 'json', date_from, date_to, limit = '100' } = req.query;

    // Подготовим параметры для BaseLinker
    const paramsObj = {};

    if (date_from) {
      const d = parseDateToUnix(date_from);
      if (!Number.isNaN(d)) paramsObj.date_confirmed_from = d;
    }
    if (date_to) {
      const d = parseDateToUnix(date_to);
      if (!Number.isNaN(d)) paramsObj.date_confirmed_to = d;
    }

    // Ограничение на количество (пример)
    const lim = Number(limit) || 100;
    paramsObj.limit = lim;

    // Собираем form body
    const body = new URLSearchParams();
    body.append('token', TOKEN);
    body.append('method', 'getOrders');
    body.append('parameters', JSON.stringify(paramsObj));

    const resp = await fetch('https://api.baselinker.com/connector.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const data = await resp.json();

    // Быстрая валидация
    if (!resp.ok) {
      return res.status(502).json({ error: 'Error from BaseLinker', details: data });
    }

    // Попытка найти массив заказов в ответе
    const orders = Array.isArray(data.orders) ? data.orders : (Array.isArray(data.result) ? data.result : (Array.isArray(data) ? data : (data && data.orders_list ? data.orders_list : null)));

    // Если не нашли массив — вернём сырой ответ для отладки
    if (!orders) {
      return res.status(200).json({ raw: data });
    }

    if (String(format).toLowerCase() === 'csv') {
      const csv = ordersToCsv(orders);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
      return res.status(200).send(csv);
    }

    // По умолчанию — отдаем JSON (массив заказов)
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(orders);

  } catch (err) {
    console.error('Error in /api/orders:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ----------------- Helpers -----------------
function parseDateToUnix(v) {
  // Принимаем ISO строку или число (UNIX seconds)
  if (!v) return NaN;
  if (/^\d+$/.test(String(v))) return Number(v); // уже UNIX
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) return NaN;
  return Math.floor(t / 1000);
}

function ordersToCsv(orders) {
  // Простая CSV-таблица: order_id, date_confirmed, customer_name, total_price, items(json)
  const rows = orders.map(o => {
    const orderId = o.order_id ?? o.order_number ?? o.order_no ?? '';
    const dateConfirmed = o.date_confirmed ? unixToIso(o.date_confirmed) : (o.date_add ? unixToIso(o.date_add) : '');
    // Попробуем собрать имя покупателя
    const customerName = (o.customer && (o.customer.name || `${o.customer.first_name || ''} ${o.customer.last_name || ''}`)) || o.customer_name || o.name || '';
    const total = o.total_price ?? o.total_brutto ?? o.total ?? '';
    // Позиции могут называться по-разному
    const items = o.items ?? o.products ?? o.order_products ?? o.order_items ?? [];
    return {
      order_id: String(orderId),
      date_confirmed: dateConfirmed,
      customer_name: String(customerName),
      total_price: String(total),
      items: JSON.stringify(items)
    };
  });

  const header = ['order_id', 'date_confirmed', 'customer_name', 'total_price', 'items'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const cols = header.map(h => escapeCsv(String(r[h] ?? '')));
    lines.push(cols.join(','));
  }
  return lines.join('\n');
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
