// رابط Google Apps Script الخاص بك
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyvEAkXNcVbhD04zZZU37Z31iczexLnUcTBe_FTpydAgenksfbaMLFiR8uK2HJY5RfB/exec";

// 1. دالة التشفير (تُنفذ في متصفح المستخدم)
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);                    
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 2. تسجيل الدخول
async function login() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    if(u && p) {
        errorDiv.style.display = 'none';
        const pHash = await hashPassword(p);
        
        const payload = {
            action: 'login',
            origin: window.location.origin,
            username: u,
            passwordHash: pHash
        };

        fetch(GAS_API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                sessionStorage.setItem('sys_user', u);
                sessionStorage.setItem('sys_token', data.token);
                sessionStorage.setItem('sys_role', data.role);
                
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('appContainer').style.display = 'flex';
                document.getElementById('userRole').innerText = data.role;
            } else {
                errorDiv.innerText = data.error;
                errorDiv.style.display = 'block';
            }
        })
        .catch(err => {
            errorDiv.innerText = "خطأ في الاتصال بالخادم.";
            errorDiv.style.display = 'block';
        });
    }
}

// 3. تسجيل الخروج
function logout() {
    sessionStorage.clear();
    location.reload();
}

// 4. دالة مساعدة لتحويل الملفات إلى Base64
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// 5. رفع الملفات والأرشفة (تُستدعى من داخل الـ iframe)
async function uploadFiles(fileInputElement) {
    if (!fileInputElement.files.length) return alert("الرجاء اختيار مستند أو التقاط صورة أولاً.");
    
    // إظهار اللودر داخل הـ iframe
    const iframeDoc = document.getElementById('mainFrame').contentWindow.document;
    iframeDoc.getElementById('loader').classList.remove('hidden');
    
    let filesData = [];
    for (let file of fileInputElement.files) {
        let base64 = await toBase64(file);
        filesData.push({
            name: file.name || 'document.jpg',
            mimeType: file.type || 'image/jpeg',
            base64: base64.split(',')[1]
        });
    }

    const payload = {
        action: 'upload',
        origin: window.location.origin,
        username: sessionStorage.getItem('sys_user'),
        token: sessionStorage.getItem('sys_token'),
        files: filesData
    };

    fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        iframeDoc.getElementById('loader').classList.add('hidden');
        if(data.error) return alert("خطأ: " + data.error);
        
        alert("تم الحفظ بنجاح!\nرقم المعاملة المستخرج: " + data.records[0].transactionNo);
        fileInputElement.value = ""; // تفريغ الحقل
    })
    .catch(err => {
        iframeDoc.getElementById('loader').classList.add('hidden');
        alert("حدث خطأ في الاتصال بالشبكة.");
    });
}

// 6. جلب الإحصائيات للوحة التحكم
function getDashboardStats() {
    const payload = {
        action: 'getDashboard',
        origin: window.location.origin,
        username: sessionStorage.getItem('sys_user'),
        token: sessionStorage.getItem('sys_token')
    };

    fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if(data.success && data.stats) {
            document.getElementById('totalDocs').innerText = data.stats.totalRecords;
        }
    });
}

// 7. البحث عن السندات
function searchData(receipt, name, phone) {
    const iframeDoc = document.getElementById('mainFrame').contentWindow.document;
    const resultsArea = iframeDoc.getElementById('resultsArea');
    resultsArea.innerHTML = "<div class='spinner'></div><p style='text-align:center;'>جاري البحث...</p>";

    const payload = {
        action: 'search',
        origin: window.location.origin,
        username: sessionStorage.getItem('sys_user'),
        token: sessionStorage.getItem('sys_token'),
        filters: { receipt, name, phone }
    };

    fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if(data.error) {
            resultsArea.innerHTML = `<p style="color:red; text-align:center;">${data.error}</p>`;
            return;
        }
        
        if (data.data && data.data.length > 0) {
            let html = "";
            data.data.forEach(item => {
                // فلترة بسيطة في الواجهة الأمامية بناءً على المدخلات
                if(
                   (receipt && !item.transactionNo.toString().includes(receipt)) ||
                   (name && !item.name.includes(name)) ||
                   (phone && !item.phone.toString().includes(phone))
                ) return;

                html += `
                <div class="result-card">
                    <div class="result-details">
                        <p><strong>رقم السند:</strong> ${item.transactionNo}</p>
                        <p><strong>الاسم:</strong> ${item.name}</p>
                        <p><strong>الفرع:</strong> ${item.branch} | <strong>التاريخ:</strong> ${item.date}</p>
                        <a href="${item.fileUrl}" target="_blank" style="color: #2563eb; text-decoration: none;">عرض الملف الأصلي</a>
                    </div>
                    <div>
                        <button class="btn-share" onclick="window.parent.shareWhatsApp('${item.name}', '${item.type}', '${item.branch}', '${item.date}', '${item.fileUrl}')">
                            مشاركة واتساب 💬
                        </button>
                    </div>
                </div>`;
            });
            resultsArea.innerHTML = html || "<p style='text-align:center;'>لا توجد نتائج مطابقة.</p>";
        } else {
            resultsArea.innerHTML = "<p style='text-align:center;'>لا توجد بيانات في الأرشيف.</p>";
        }
    });
}

// 8. مشاركة عبر الواتساب
function shareWhatsApp(name, type, branch, date, url) {
    const text = `*نظام أرشيف المنطقة*\n\nالاسم: ${name}\nنوع المعاملة: ${type}\nالفرع: ${branch}\nالتاريخ: ${date}\n\nرابط المستند:\n${url}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
}