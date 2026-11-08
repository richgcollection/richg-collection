# WhatsApp sales bot (n8n + website)

Customers browse the catalog on WhatsApp with menus and buttons, add items to a cart and pay with the **website's own Paystack checkout**. Stock and orders live in the same database as the website, so WhatsApp orders show up in **Admin → Orders** and **Inventory** like web orders.

```
Customer ⇄ WhatsApp Cloud API ⇄ n8n ⇄ website /api/bot/message (catalog, cart, stock, order, Paystack link)
                                     ⇡
Paystack ⇢ website /api/webhooks/paystack ⇢ markOrderPaid ⇢ n8n "Order paid" ⇢ WhatsApp confirmation
```

## How it works

- **Menus:** categories → products (8 per page, "More items") → size/option → quantity. Customers can also type a product name to search.
- **Checkout:** name (pre-filled from the WhatsApp profile), delivery town (matched against **Admin → Shipping rates**, so delivery fees come from the dashboard), street or landmark, email (optional), then an order summary and a **Pay** button.
- **Payment:** the site creates a normal `PENDING` order (`channel = WHATSAPP`) and a Paystack transaction with the order number as the reference. That's the same as the web checkout. The existing Paystack webhook marks it paid, deducts stock, writes the stock ledger, updates the customer and affiliate records, and sends the Meta purchase event.
- **Stock holds:** unpaid orders from the last 30 minutes (`BOT_RESERVATION_MINUTES`), from WhatsApp *or* the website, are subtracted from what the bot offers. Checkouts are serialized with a database lock, so two people can't both get a payment link for the last unit. After 30 minutes the hold simply lapses. A customer who pays late still gets the order, as on the website.
- **Repeat customers** get "Deliver to the same details as last time?"
- **"Talk to us"** pauses the bot for that customer for 2 hours (typing *menu* resumes it) and alerts a staff number.
- Typing *menu*, *hi* or *hello* at any time shows the main menu, *cart* shows the cart, and *cancel* exits checkout.

## 1. Website

1. Apply the migration, which adds `Order.channel`, the `BotSession` table and one index:
   `npx prisma migrate deploy` (with `DIRECT_URL` pointing at Supabase).
2. Add the environment variables in Vercel (see `.env.example`):
   - `BOT_API_KEY`: a long random string, e.g. the output of `openssl rand -hex 32`.
   - `N8N_WHATSAPP_NOTIFY_URL`: the Production URL of the n8n **Order paid** webhook, e.g. `https://n8n.example.com/webhook/richg-order-paid`.
   - Optional: `BOT_RESERVATION_MINUTES` (default 30) and `BOT_SUPPORT_TEXT`.
3. Deploy. Paystack needs no changes: the existing webhook URL and keys are used.

## 2. Meta (WhatsApp Cloud API)

1. In Meta Business Manager, create an app (type **Business**) and add the **WhatsApp** product. Register and verify the business phone number.
   - A number that is already active on the WhatsApp Business app must either be migrated or use Meta's "coexistence" onboarding.
2. Create a **System User** with a permanent token that has `whatsapp_business_messaging` and `whatsapp_business_management`. Copy the **Phone number ID** from *WhatsApp → API Setup*.
3. Configure the webhook in *WhatsApp → Configuration*:
   - Callback URL: `https://<your-n8n>/webhook/richg-whatsapp`.
   - Verify token: the same string you put in the n8n *Verify token OK?* node.
   - Subscribe to **messages**.

## 3. n8n

1. Import `richg-whatsapp-bot.json` (*Workflows → Import from file*).
2. Create two **Header Auth** credentials:
   - **WhatsApp Cloud API token**: Name `Authorization`, Value `Bearer <system-user token>`.
   - **RichG Bot API key**: Name `Authorization`, Value `Bearer <BOT_API_KEY>`.
   
   Then select them on the HTTP Request nodes and on the *Order paid* webhook.
3. Replace these placeholders:
   - The verify token in *Verify token OK?*.
   - `PHONE_NUMBER_ID` in *Paid messages*.
   - The staff number in *Alert staff*.
   - The site URL in *Ask website bot*, if it isn't richgcollection.com.
4. **Activate** the workflow. The verify-token step in Meta only succeeds while the workflow is active.
5. n8n must be reachable over HTTPS, and `WEBHOOK_URL` must be set to its public URL.

## Testing

- **Unpublished app:** while the Meta app is in development mode, message the number only from test recipients added in *API Setup*.
- **Paystack test mode:** use test keys (Admin → Payment settings) and Paystack's test card or M-Pesa numbers.
- **Without WhatsApp:** you can call the bot directly:
  ```bash
  curl -X POST https://richgcollection.com/api/bot/message \
    -H "Authorization: Bearer $BOT_API_KEY" -H "Content-Type: application/json" \
    -d '{"from":"254712345678","profileName":"Test","text":"hi"}'
  ```

## Notes and limits

- **24-hour window:** WhatsApp only allows free-form replies within 24 hours of the customer's last message. Payment confirmations are normally inside that window. Marketing or abandoned-cart messages sent later need approved **templates**, which this workflow does not send.
- **Staff alert:** the staff alert is a WhatsApp text, so the same 24-hour rule applies to the staff number. Message the business number from the staff phone once a day, or swap the node for email or Telegram.
- **Emails:** when a customer skips the email step, the order uses `wa<phone>@richgcollection.com` because Paystack requires an email.
- **Customer records:** customers are tagged with source `WhatsApp` in **Customers**.
- **Admin filter:** the admin Orders list doesn't filter by channel yet. The `channel` column is there for it.
