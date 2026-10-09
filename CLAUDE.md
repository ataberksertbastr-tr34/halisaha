# Halı Saha Organizatörü – proje notları

## Bu proje ne?
Haftada iki halı saha maçı organize eden tek bir kişinin (organizatör) telefonunda her gün kullandığı uygulama. Organizatör kadroyu toplar, sahayı ayarlar, takımları kurar ve saha ücretini toplar. Uygulamanın tek amacı bu işi hızlandırmak.

- Başlangıç kodu: `index.html` (bağımlılıksız, tek dosya, vanilla JS).
- Grup kuralları: `KURALLAR.md` (uygulamadaki iş kuralları bunlarla tutarlı olmalı: 24 saat kuralı, geç iptal payı öder, kaleciler ücretsiz, borçlu oyuncu uyarısı vb.).

## Değişmez kurallar
- Arayüz dili Türkçe (İngilizce seçeneği korunur). Türkçe karakter, büyük/küçük harf ve alfabetik sıralama doğru olmalı (`localeCompare(..., "tr")`).
- Önce mobil: 360 px genişlikte kusursuz, tek elle kullanım, dokunma alanları en az 44 px.
- Veri uyumluluğu kutsal: eski uygulamanın "Yedeği kopyala" ile ürettiği JSON (şema v1 ve v2; `index.html` içindeki `migrate()` fonksiyonuna bak) her zaman eksiksiz içe aktarılabilmeli. Şema değişirse sürüm numarası artar ve migration + test yazılır.
- Kişisel veri (oyuncu isimleri, telefon numaraları, IBAN, yedek dosyaları) asla repoya commit edilmez. Test verileri uydurma isimlerle yazılır.
- Organizatör telefonunda hiçbir şey kurmaz. Test, derleme ve yayın GitHub Actions ile yapılır; yayın GitHub Pages'e gider.
- Görsel kimlik: halı saha yeşili, takım yelek renkleri (Sarılar `#E2F01C`, Turuncular `#FF6A1A`), Barlow / Barlow Condensed fontları. Açık ve koyu tema desteklenir.

## Çalışma şekli
- Organizatöre soru sormak için durma; makul varsayımlar yap ve PR açıklamasında listele.
- Her özellik ayrı ve anlaşılır bir commit olsun. İş bitince tek bir pull request aç.
- PR açıklaması Türkçe olsun: ne yapıldı, nasıl test edildi, organizatörün kendi yapması gereken adımlar (varsa) madde madde.
- Commit ve PR öncesi tüm testler geçmeli; konsolda hata olmamalı.
