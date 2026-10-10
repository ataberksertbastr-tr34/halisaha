# Predators · Organizatör – proje notları

## Bu proje ne?
Predators grubunda haftada iki halı saha maçı ve paintball, airsoft, voleybol, ayak tenisi, masa tenisi, kıraathane gibi etkinlikleri organize eden tek bir kişinin (organizatör) telefonunda her gün kullandığı uygulama. Organizatör kadroyu toplar, sahayı/mekânı ayarlar, takımları ve kurayı kurar, ücreti toplar, disiplini yürütür. Uygulamanın tek amacı bu işi hızlandırmak.

- Başlangıç kodu: `index.html` (bağımlılıksız, tek dosya, vanilla JS).
- Grup kuralları: `KURALLAR.md` ("Halı Saha ve Etkinlik Kuralları": 3 kısım, 21 bölüm, altın kurallar, yaptırımlar tablosu). Uygulamadaki iş kuralları bunlarla tutarlı olmalı: 24 saat kuralı (1.4), geç iptal payı öder (1.5, 15.3), habersiz gelmeyen sıranın sonuna (1.6), kaleciler ücretsiz (2.1), borçlu yazılamaz (2.4), kademeli yaptırım (9.3), etkinlik kuralları (Bölüm 15–21). Kod ve metinlerde madde numarasıyla atıf yapılır.

## Değişmez kurallar
- Arayüz dili Türkçe (İngilizce seçeneği korunur). Türkçe karakter, büyük/küçük harf ve alfabetik sıralama doğru olmalı (`localeCompare(..., "tr")`).
- Önce mobil: 360 px genişlikte kusursuz, tek elle kullanım, dokunma alanları en az 44 px.
- Veri uyumluluğu kutsal: eski uygulamanın "Yedeği kopyala" ile ürettiği JSON (şema v1 ve v2; `index.html` içindeki `migrate()` fonksiyonuna bak) her zaman eksiksiz içe aktarılabilmeli. Şema değişirse sürüm numarası artar ve migration + test yazılır.
- Kişisel veri (oyuncu isimleri, telefon numaraları, IBAN, yedek dosyaları) asla repoya commit edilmez. Test verileri uydurma isimlerle yazılır.
- Organizatör telefonunda hiçbir şey kurmaz. Test, derleme ve yayın GitHub Actions ile yapılır; yayın GitHub Pages'e gider.
- Görsel kimlik: Predators arması ve renkleri — gece siyahı `#13161C`, altın `#C9A04B`, bordo `#84191F`, krem `#EEEAD9`. İki koyu çerçeve (üst bölüm ve sekme çubuğu) iki temada da gece siyahı; aradaki içerik açık temada fildişi kâğıt. Altın varak gibi kullanılır (ince çizgi, ikon, rakam), bordo kalkan çeyreği gibi (kuşak, canlı/uyarı). Tam "maç günü" başlığı yalnızca Etkinlik sekmesinde, diğer sayfalarda ince kulüp çubuğu. Açık temada birincil düğme gece siyahı, koyu temada altın. Takım yelekleri Ayarlar'dan (varsayılan Sarılar `#E6CF3A`, Turuncular `#EE7A2C`). Barlow / Barlow Condensed fontları. Açık (fildişi) ve koyu (gece) tema desteklenir.
- Halı saha mesaj şablonlarının varsayılanları eski uygulamanın mesajlarıyla birebir aynı kalır (`tests/messages.test.ts`).

## Çalışma şekli
- Organizatöre soru sormak için durma; makul varsayımlar yap ve PR açıklamasında listele.
- Her özellik ayrı ve anlaşılır bir commit olsun. İş bitince tek bir pull request aç.
- PR açıklaması Türkçe olsun: ne yapıldı, nasıl test edildi, organizatörün kendi yapması gereken adımlar (varsa) madde madde.
- Commit ve PR öncesi tüm testler geçmeli; konsolda hata olmamalı.
