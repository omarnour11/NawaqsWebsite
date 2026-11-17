/**
 * ============================================================================
 * كود Google Apps Script لمزامنة بيانات منصة نواقص (Nawaqss Leads) مع Google Sheets
 * مع خاصية منع التكرار (Deduplication) التلقائية الذكية
 * ============================================================================
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getActiveSheet();

    // 1. تأكد من وجود صف العناوين في البداية
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
      var headerRange = sheet.getRange(1, 1, 1, 11);
      headerRange.setBackground('#0E7C6B');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
    }

    var data = {};
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    // 2. فحص ومنع التكرار (Deduplication):
    // إذا كان كود الطلب موجوداً مسبقاً أو تكرر نفس رقم الموبايل والاسم في نفس اليوم، لا يتم تكراره
    if (sheet.getLastRow() > 1 && (data.id || data.phone)) {
      var allRows = sheet.getDataRange().getValues();
      var cleanNewPhone = String(data.phone || '').replace(/\D/g, '');
      var newName = String(data.fullName || '').trim().toLowerCase();

      for (var i = 1; i < allRows.length; i++) {
        var existingId = String(allRows[i][0] || '').trim();
        var existingName = String(allRows[i][3] || '').trim().toLowerCase();
        var existingPhone = String(allRows[i][4] || '').replace(/\D/g, '');

        // إذا تطابق كود الطلب، أو تطابق رقم الموبايل والاسم
        if ((data.id && existingId === data.id) || (cleanNewPhone && existingPhone === cleanNewPhone && existingName === newName)) {
          return ContentService.createTextOutput(JSON.stringify({
            result: 'ignored_duplicate',
            message: 'تم منع التكرار، السجل مسجل بالفعل مسبقاً',
            id: existingId
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // 3. إضافة الصف الجديد بدون تكرار
    sheet.appendRow([
      data.id || '',
      data.createdAt || new Date().toISOString(),
      data.role || 'مريض',
      data.fullName || '',
      "'" + (data.phone || ''), // علامة ' لمنع إكسيل من إخفاء الصفر الأول
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
    message: 'Nawaqss Google Sheets Webhook is ready with deduplication support'
  })).setMimeType(ContentService.MimeType.JSON);
}
