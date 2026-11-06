# دليل تفعيل وربط نظام مدير (Modeer ERP) بروبوتات الذكاء الاصطناعي (Claude & ChatGPT)
## Modeer Model Context Protocol (MCP) & AI Chatbot Integration Guide

تم تجهيز نظام **Modeer ERP** بأحدث معايير بروتوكول سياق النماذج **Model Context Protocol (MCP)** الصادر عن شركة Anthropic، بالإضافة إلى واجهات **OpenAPI 3.1** المتوافقة 100% مع ميزات **ChatGPT Custom Actions** من شركة OpenAI.

---

### بيانات الاتصال والمفاتيح المعتمدة (Production Credentials)

* **رابط موصل MCP السحابي (Cloudflare Edge):**  
  `https://modeer.modeer.workers.dev/api/mcp`
* **رابط موصل الأحداث الحية (MCP SSE Stream):**  
  `https://modeer.modeer.workers.dev/api/mcp/sse`
* **رابط مواصفات OpenAPI الجاهزة للاستيراد:**  
  `https://modeer.modeer.workers.dev/openapi.json`
* **رابط سياسة الخصوصية (مطلوب لـ ChatGPT):**  
  `https://modeer.modeer.workers.dev/privacy`
* **مفتاح الـ API الدائم والمخصص للروبوتات (Master AI Bot Key):**  
  `modeer_sk_live_master_ai_agent_production_key_2026`

---

## 1. ربط Claude Desktop (تطبيق كلود للكمبيوتر)

تطبيق **Claude Desktop** يدعم بروتوكول MCP مباشرة، مما يتيح لكلود فحص الحسابات، قراءة حركة الخزينة، وإدخال قيود اليومية المحاسبية تلقائياً.

### خطوات الإعداد:
1. افتح ملف إعدادات كلود على جهازك:
   * **ويندوز (Windows):**  
     `%APPDATA%\Claude\claude_desktop_config.json`
   * **ماك (macOS):**  
     `~/Library/Application Support/Claude/claude_desktop_config.json`
   * **لينكس (Linux):**  
     `~/.config/Claude/claude_desktop_config.json`

2. أضف إعداد خادم `modeer` داخل كائن `mcpServers`:

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
        "MODEER_API_KEY": "modeer_sk_live_master_ai_agent_production_key_2026",
        "MODEER_DEFAULT_COMPANY": "Commercial Agency"
      }
    }
  }
}
```

*(ملاحظة: إذا كنت تنقل المجلد لجهاز آخر، فقط ضع المسار الصحيح لملف `index.js` على ذلك الجهاز).*

3. أعد تشغيل تطبيق Claude Desktop. ستظهر أيقونة المطرقة 🔨 (الأدوات) داخل المحادثة وبها 12 أداة محاسبية جاهزة!

---

## 2. ربط ChatGPT (إنشاء Custom GPT في OpenAI)

يمكنك إنشاء بوت مالي خاص بشركتك داخل ChatGPT عبر ميزة **Actions**:

### خطوات الإعداد:
1. ادخل إلى **[ChatGPT](https://chatgpt.com)** ثم اضغط على **Explore GPTs** ثم **+ Create**.
2. في تبويب **Configure**:
   * **Name:** مستشار مدير المالي (Modeer Financial Advisor)
   * **Description:** إدارة الحسابات والقيود اليومية والتقارير المالية لشركات نظام مدير عبر واجهات ERP الذكية.
   * **Instructions:** انسخ النص التالي وضعه في صندوق التعليمات:
     ```text
     أنت المستشار المالي والمحاسبي الذكي لنظام Modeer ERP.
     لديك وصول مباشر إلى قاعدة البيانات السحابية عبر Actions.
     القواعد المحاسبية الصارمة:
     1. التوازن الثنائي (Double-Entry): إجمالي المدين = إجمالي الدائن دائماً.
     2. دورة المستند: أنشئ القيود الجديدة بحالة 'draft' (مسودة) أولاً، ثم اطلب تأكيد المستخدم قبل الترحيل 'posted'.
     3. لا يمكن حذف أو تعديل أي قيد مرحل؛ بل يتم استخدام الإلغاء (Cancel) أو التعديل البديل (Amend).
     4. عند طلب تقرير الخزينة أو الأرباح، استخدم الأدوات واستخرج الأرقام الدقيقة للشركة المطلوبة.
     ```
3. انزل لأسفل واضغط على **Create new action**:
   * بجانب **Schema**، اضغط على **Import from URL**.
   * الصق الرابط التالي واضغط **Import**:  
     `https://modeer.modeer.workers.dev/openapi.json`
   * سيقوم ChatGPT تلقائياً بقراءة كافة نقاط النهاية، المعاملات، ودليل الحسابات!
4. إعداد التوثيق (**Authentication**):
   * اضغط على ترس الإعدادات بجانب Authentication:
   * **Authentication Type:** اختر **API Key**.
   * **Auth Type:** اختر **Bearer** (أو Custom Header باسم `X-API-Key`).
   * **API Key:** الصق المفتاح:  
     `modeer_sk_live_master_ai_agent_production_key_2026`
5. في حقل **Privacy Policy URL**:
   * ضع الرابط: `https://modeer.modeer.workers.dev/privacy`
6. اضغط **Save** أو **Publish**. الآن أصبح شات جي بي تي متصلاً بالنظام الحي مباشرة!

---

## 3. ربط أدوات التطوير وCursor وClaude Code

### لبرنامج Cursor IDE:
في إعدادات Cursor (Settings -> Features -> MCP -> Add New MCP Server):
* **Name:** `modeer`
* **Type:** `command`
* **Command:** `node /home/mosama/projects/modeer/mcp-server/index.js`

### لأداة Claude Code CLI:
نفّذ الأمر التالي في سطر الأوامر:
```bash
claude mcp add modeer node /home/mosama/projects/modeer/mcp-server/index.js
```

---

## 4. قائمة الأدوات المحاسبية المتاحة للروبوت (12 أداة)

| اسم الأداة (Tool Name) | الوظيفة المحاسبية |
| :--- | :--- |
| `modeer_list_companies` | استعراض جميع الشركات المسجلة وعملتها وتواريخ إنشائها |
| `modeer_get_chart_of_accounts` | البحث واستعراض دليل الحسابات وفئاته (أصول، خصوم، إيرادات...) |
| `modeer_list_vouchers` | استعراض سجل القيود اليومية مع فلترة الحالات والتواريخ |
| `modeer_get_voucher` | قراءة تفاصيل قيد محدد بأسطره وأطرافه وأسعاره وملاحظاته |
| `modeer_create_voucher` | إنشاء قيد يومية (مسودة أو مرحل) مع التحقق من توازن القيد وصحة الحسابات |
| `modeer_post_voucher` | ترحيل قيد مسودة إلى دفتر الأستاذ العام وتثبيته قانونياً |
| `modeer_cancel_voucher` | إلغاء قيد مرحل أو مسودة مع توثيق سبب الإلغاء في سجل التدقيق |
| `modeer_amend_voucher` | تعديل قيد مرحل عبر إلغائه وإنشاء قيد بديل مرتبط به تلقائياً |
| `modeer_get_cash_movement` | كشف حركة النقدية والبنوك مع إجمالي المقبوضات والمدفوعات والرصيد |
| `modeer_get_trial_balance` | ميزان المراجعة الشامل وتأكيد توازن الحسابات الإجمالية |
| `modeer_get_financial_summary` | ملخص المؤشرات المالية: الأصول، الخصوم، الإيرادات، المصروفات، وصافي الربح |
| `modeer_create_company` | إنشاء شركة جديدة مع التوليد التلقائي لدليل الحسابات والعملات |

---

## 5. أمثلة لأسئلة وأوامر يمكنك توجيهها للروبوت بعد الربط

* *"ما هو الموقف المالي وحركة الخزينة لشركة الوكالة التجارية هذا الشهر؟"*
* *"أظهر لي الحسابات التابعة للأصول النقدية في دليل حسابات تجارة هاب."*
* *"أنشئ قيد يومية مسودة لسداد مصروفات إيجار بقيمة 500 دولار نقداً من الخزينة الرئيسية."*
* *"هل ميزان المراجعة متوازن في شركة Commercial Agency؟ وما هو صافي أرباح الفترة؟"*
* *"راجع القيد رقم 2 وأخبرني بأطرافه وإذا كان مرحلاً أم مسودة."*
