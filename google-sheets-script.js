/**
 * ============================================================================
 * كود Google Apps Script لمزامنة بيانات منصة نواقص (Nawaqss Leads) مع Google Sheets
 * ============================================================================
 * 
 * طريقة الاستخدام في دقيقة واحدة:
 * 1. افتح شيت جديد في Google Sheets (سمّه مثلاً: Nawaqss Leads).
 * 2. من القائمة العلوية اضغط: Extensions (التوسيعات) -> Apps Script.
 * 3. امسح أي كود موجود هناك، والصق هذا الكود بالكامل.
 * 4. اضغط على الزر الأزرق: Deploy (نشر) -> New deployment (نشر جديد).
 * 5. اضغط على الترس بجانب "Select type" واختر: Web app (تطبيق ويب).
 * 6. في خانة "Who has access" (من يملك حق الوصول)، اختر: Anyone (أي مستخدم) - مهم جداً!
 * 7. اضغط Deploy وامنح الأذونات (Authorize access).
 * 8. انسخ الرابط الذي يظهر لك (Web app URL) وضعه في إعدادات Vercel أو ملف .env كـ:
 *    GOOGLE_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/XXXXX/exec
 * 
 * مبروك! الآن أي تسجيل جديد في الموقع سيظهر في شيت الإكسيل فوراً ولن يُمسح أبداً!
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getActiveSheet();

    // تأكد من وجود صف العناوين في البداية
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'كود الطلب',
        'تاريخ التسجيل (UTC)',
        'الصفة',
        'الاسم بالكامل',
        'رقم الموبايل',
        'البريد الإلكتروني',
        'المحافظة',
        'المدينة أو المنطقة',
        'طريقة التواصل المفضلة',
        'ملاحظات إضافية',
        'IP العميل'
      ]);
      // تنسيق صف العناوين
      var headerRange = sheet.getRange(1, 1, 1, 11);
      headerRange.setBackground('#0E7C6B');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
    }

    var data = {};
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    sheet.appendRow([
      data.id || '',
      data.createdAt || new Date().toISOString(),
      data.role || 'مريض',
      data.fullName || '',
      "'" + (data.phone || ''), // علامة ' لمنع إكسيل من إخفاء الصفر في بداية الرقم
      data.email || '',
      data.governorate || '',
      data.cityArea || '',
      data.contactPreference || '',
      data.notes || '',
      data.clientIp || ''
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      id: data.id
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'active',
    message: 'Nawaqss Google Sheets Webhook is ready'
  })).setMimeType(ContentService.MimeType.JSON);
}
