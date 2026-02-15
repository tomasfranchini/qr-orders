# Modelo de Datos

Este documento define la estructura principal de datos del sistema de pedidos por QR.

El sistema soporta:
- Consumo en mesa (DINE_IN)
- Take away
- Delivery
- Múltiples pedidos por mesa mediante sesiones abiertas

---

# 1. restaurants

Representa cada local gastronómico.

- id (UUID o entero)
- name (string)
- slug (string único para URL)
- phone (string)
- address (string)
- created_at (datetime)

Un restaurante puede tener:
- Muchas mesas
- Muchos productos
- Muchos pedidos
- Muchos usuarios

---

# 2. tables

Representa las mesas físicas del local.

- id
- restaurant_id (FK → restaurants)
- number (número visible de mesa)
- code (código único para generar el QR)
- active (boolean)

Una mesa puede tener:
- Muchas sesiones (a lo largo del tiempo)

---

# 3. table_sessions

Representa una "cuenta abierta" en una mesa.

Permite múltiples pedidos por mesa.

- id
- restaurant_id (FK)
- table_id (FK)
- status (OPEN | CLOSED | CANCELLED)
- opened_at (datetime)
- closed_at (datetime, nullable)

Reglas:
- Una mesa solo puede tener una sesión OPEN a la vez.
- Una sesión puede tener muchos pedidos.

---

# 4. menu_categories

Categorías del menú (ej: Bebidas, Pizzas, Postres).

- id
- restaurant_id (FK)
- name (string)
- order_index (para orden visual)

---

# 5. menu_items

Productos individuales del menú.

- id
- restaurant_id (FK)
- category_id (FK)
- name (string)
- description (string)
- price (decimal)
- image_url (string, nullable)
- active (boolean)

---

# 6. orders

Representa un pedido confirmado.

Puede pertenecer a:
- Una sesión (si es en mesa)
- Ninguna sesión (si es take away o delivery)

- id
- restaurant_id (FK)
- session_id (FK nullable)
- order_type (DINE_IN | TAKEAWAY | DELIVERY)
- status (PENDING | PREPARING | READY | COMPLETED | CANCELLED)
- payment_method (CASH | WALLET)
- customer_name (string, nullable)
- customer_phone (string, nullable)
- delivery_address (string, nullable)
- total_amount (decimal)
- created_at (datetime)

Reglas:
- Un pedido confirmado no se edita.
- El método de pago se define al confirmar el pedido.

---

# 7. order_items

Productos dentro de un pedido.

Se guarda snapshot del nombre y precio para mantener historial correcto.

- id
- order_id (FK)
- menu_item_id (FK)
- name_snapshot (string)
- price_snapshot (decimal)
- quantity (int)
- subtotal (decimal)

Regla:
- El subtotal = price_snapshot * quantity

---

# 8. users

Usuarios internos del sistema.

- id
- restaurant_id (FK)
- email (string único)
- password_hash (string)
- role (OWNER | STAFF | KITCHEN)
- active (boolean)

