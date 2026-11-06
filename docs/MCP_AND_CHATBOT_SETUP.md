# دليل تفعيل وربط نظام مدير (Modeer ERP) بروبوتات الذكاء الاصطناعي (Claude & ChatGPT)
## Modeer Model Context Protocol (MCP) & OAuth 2.0 Integration Guide

يدعم نظام **Modeer ERP** خيارين متقدمين ومحميين لتكامل روبوتات الذكاء الاصطناعي (ChatGPT, Claude, Cursor):
1. **ربط الويب المباشر عبر بروتوكول OAuth 2.0 (موصى به لـ ChatGPT Plugins & Custom GPTs):**  
   يقوم المستخدم بتسجيل الدخول بحسابه عبر المتصفح وتفويض الروبوت، ولا يحتاج إلى كتابة أو كشف أي مفاتيح API يدوياً، ويعمل الروبوت حصراً بنفس صلاحيات ودور المستخدم والشركة المحددة.
2. **بروتوكول سياق النماذج المباشر (Native Model Context Protocol - MCP):**  
   يعمل على خوادم Cloudflare Edge السحابية عبر endpoints تدعم كلاً من JSON-RPC المباشر والبث الحي (SSE).

---

### بيانات الاتصال المعتمدة على سيرفر الإنتاج (Production Endpoints)

| الخاصية | الرابط / القيمة |
| :--- | :--- |
| **رابط موصل MCP السحابي (Edge MCP)** | `https://modeer.modeer.workers.dev/api/mcp` |
| **رابط موصل الأحداث الحية (MCP SSE Stream)** | `https://modeer.modeer.workers.dev/api/mcp/sse` |
| **رابط تسجيل الدخول والتفويض (OAuth Authorize URL)** | `https://modeer.modeer.workers.dev/oauth/authorize` |
| **رابط إصدار التوكن (OAuth Token URL)** | `https://modeer.modeer.workers.dev/oauth/token` |
| **رابط مواصفات OpenAPI الجاهزة** | `https://modeer.modeer.workers.dev/openapi.json` |
| **رابط سياسة الخصوصية (Privacy Policy)** | `https://modeer.modeer.workers.dev/privacy` |
| **Client ID الافتراضي** | `chatgpt-modeer` |
| **Client Secret الافتراضي** | `modeer_oauth_secret_2026` |

---

## 1. كيف تجيب على استفسار ChatGPT Plugin Creator؟

عند بناء إضافة داخل **ChatGPT Plugin Creator** وسؤالك:
> *"Which approach should we use?*  
> *A — Build the MCP adapter for Modeer (recommended if no MCP server exists).*  
> *B — I already have an MCP endpoint."*

اختر فوراً: **`B — I already have an MCP endpoint`**
وقم بتزويده برابط الـ MCP السحابي:
```text
https://modeer.modeer.workers.dev/api/mcp
```
*(أو رابط SSE: `https://modeer.modeer.workers.dev/api/mcp/sse`)*  
لأن نظام Modeer يمتلك بالفعل خادم MCP أصلي (Native MCP Server) مدمج ومبرمج على مستوى الخادم.

---

## 2. تفعيل الاتصال عبر OAuth 2.0 (تسجيل الدخول بالمتصفح)

تعتبر هذه الطريقة هي الأكثر أماناً واحترافية؛ حيث يظهر للمستخدم في ChatGPT زر **"Connect to Modeer"**؛ وعند الضغط عليه:
1. تفتح نافذة متصفح رسمية لنظام مدير بشعار النظام.
2. يسجل المستخدم دخوله باسمه وكلمة مروره ويختار الشركة التي يريد تفويض الروبوت عليها.
3. يضغط **"تفويض وسماح بالوصول (Authorize)"**.
4. يغلق المتصفح ويرتبط شات جي بي تي تلقائياً، مع تقييده التام بصلاحيات ذلك المستخدم!

### خطوات ضبط OAuth داخل ChatGPT (Actions / GPT Configuration):
1. افتح **[ChatGPT](https://chatgpt.com)** -> **Explore GPTs** -> **+ Create**.
2. في تبويب **Configure** -> انزل إلى **Actions** واضغط **Create new action**.
3. بجانب **Schema** اضغط **Import from URL** وضع:  
   `https://modeer.modeer.workers.dev/openapi.json`
4. في إعدادات الأمان والتسجيل (**Authentication**):
   * اضغط على الترس بجانب Authentication واختر **OAuth**.
   * **Client ID:** `chatgpt-modeer`
   * **Client Secret:** `modeer_oauth_secret_2026`
   * **Authorization URL:** `https://modeer.modeer.workers.dev/oauth/authorize`
   * **Token URL:** `https://modeer.modeer.workers.dev/oauth/token`
   * **Scope:** `read write`
   * **Token Exchange Method:** `Default (POST / Basic)`
5. في حقل **Privacy Policy URL**:
   * ضع: `https://modeer.modeer.workers.dev/privacy`
6. احفظ الإعدادات بالضغط على **Save**.

---

## 3. حماية الصلاحيات والرقابة المحاسبية (RBAC & Guardrails)

بمجرد ربط الروبوت عبر حسابه، **يطبق النظام مبدأ الصلاحيات الأدنى (Least Privilege)** بناءً على دور المستخدم الفعلي في نظام مدير:

1. **المشاهد (Viewer):**
   * يحق للروبوت فقط: قراءة دليل الحسابات، استعراض كشف حركة الخزينة، الاطلاع على ميزان المراجعة والتقارير المالية.
   * **محظور تماماً:** إنشاء قيود، تعديل مسودات، أو ترحيل القيود (تُرفض فورا برسالة: *Permission Denied: Viewer role cannot create vouchers*).
2. **المحاسب (Accountant):**
   * يحق للروبوت: إنشاء قيود يومية بحالة مسودة (`draft`) للمراجعة، وقراءة كافة التقارير.
   * **محظور تماماً:** الترحيل النهائي المباشر لدفتر الأستاذ العام (`posted`) أو إلغاء القيود القديمة إلا بموافقة المدير.
3. **المدير المالي والمسؤول (Manager / Admin):**
   * يحق للروبوت: إنشاء القيود، ترحيلها (`post`)، إلغاؤها (`cancel`)، أو تعديلها بديلاً (`amend`).
4. **عزل الشركات الصارم (Multi-Tenant Isolation):**
   * لا يمكن للروبوت استعراض أو لمس بيانات أي شركة أخرى غير الشركة التي اختارها المستخدم وصرح له بالوصول إليها أثناء خطوة الـ OAuth.
5. **سجل التدقيق القانوني (Immutable Audit Trail):**
   * أي عملية يقوم بها الروبوت تُسجل في قاعدة البيانات باسم المستخدم الصريح متبوعاً بـ `(via AI Assistant)` (مثال: `sameh malek (via AI Assistant)` أو `mohamadosama (via AI Assistant)`).

---

## 4. ربط Claude Desktop & Claude Code

تطبيق Claude على جهازك يعمل بموصل محلي سريع (`mcp-server/index.js`):

```json
{
  "mcpServers": {
    "modeer": {
      "command": "node",
      "args": [
        "/home/mosama/projects/modeer/mcp-server/index.js"
      ],
      "env": {
        "MODEER_API_URL": "https://modeer.modeer.workers.dev",
        "MODEER_DEFAULT_COMPANY": "Commercial Agency"
      }
    }
  }
}
```

---

## 5. قائمة الأدوات المحاسبية المتاحة (12 أداة)

* `modeer_list_companies`: استعراض الشركات المصرح بها للمستخدم.
* `modeer_get_chart_of_accounts`: استعراض وفلترة دليل الحسابات.
* `modeer_list_vouchers`: استعراض سجل القيود اليومية وحالاتها.
* `modeer_get_voucher`: قراءة أسطر وتفاصيل قيد محدد.
* `modeer_create_voucher`: إنشاء قيد يومية متوازن (وفق صلاحيات المستخدم).
* `modeer_post_voucher`: ترحيل قيد مسودة (للمدراء فقط).
* `modeer_cancel_voucher`: إلغاء قيد وتوثيق السبب في سجل التدقيق.
* `modeer_amend_voucher`: إلغاء القيد القديم وإنشاء بديل مرتبط به.
* `modeer_get_cash_movement`: كشف حركة الخزينة والبنوك والمقبوضات/المدفوعات.
* `modeer_get_trial_balance`: ميزان المراجعة وحساب الأرصدة الختامية.
* `modeer_get_financial_summary`: ملخص المركز المالي وصافي الأرباح.
* `modeer_create_company`: إنشاء شركة جديدة (للمسؤول فقط).
