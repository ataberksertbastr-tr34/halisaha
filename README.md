# Predators · Organizatör

Predators grubunun haftalık halı saha maçlarını ve diğer etkinliklerini
(paintball, airsoft, voleybol, ayak tenisi, masa tenisi, kıraathane ve
diğerleri) organize etmek için telefonun ana ekranına kurulan, **internetsiz de
çalışan** uygulama: kadro, yedek listesi, takımlar ve kura, skor tabelası,
ödemeler, kasa, disiplin, duyurular, istatistikler ve
[Halı Saha ve Etkinlik Kuralları](KURALLAR.md) tek yerde.

**Uygulama adresi:** <https://ataberksertbastr-tr34.github.io/halisaha/>

> Telefonuna hiçbir şey kurman gerekmez (uygulama mağazası yok). Adresi açıp
> "Ana ekrana ekle" demen yeterli. Veriler cihazında durur; Google hesabınla
> giriş yaparsan telefonda ve bilgisayarda kendiliğinden aynı kalır.

---

## 1. Telefona kurulum

### Android (Chrome)

1. Chrome'da uygulama adresini aç.
2. Üstte **Yükle** düğmesi çıkar (ya da Chrome menüsü ⋮ → **Uygulamayı yükle**).
3. Onayla. Ana ekranda Predators armasıyla **Predators** belirir.

### iPhone (Safari)

1. Safari'de uygulama adresini aç (Chrome'da değil, Safari'de).
2. Alttaki **Paylaş** düğmesine (kare ve yukarı ok) dokun.
3. **Ana Ekrana Ekle** → **Ekle**.

Kurduktan sonra uygulama tam ekran açılır ve internet olmadan da çalışır.
Yeni sürüm yayınlandığında üstte **"Yeni sürüm hazır → Güncelle"** şeridi
çıkar; dokununca güncellenir, verilerin aynen kalır.

---

## 2. Eski uygulamadan veri taşıma

Eski tek dosyalık uygulamadaki her şey (oyuncular, mevki/seviye/telefon,
aktif/pasif, maçlar, katılım, yedek listesi, misafirler, takımlar, skorlar,
sahalar, ödemeler, muafiyetler, ayarlar) eksiksiz taşınır.

1. **Eski uygulamada:** Ayarlar → Yedekleme → **Yedeği kopyala** → **Kopyala**.
2. **Yeni uygulamada:** Daha → Ayarlar → Yedekleme → **Yedekten yükle**.
3. Kopyaladığın metni kutuya yapıştır → **Yükle**.
4. Özet ekranında oyuncu ve maç sayısını kontrol et → **Yükle**.

İpucu: Yedek metnini önce kendine WhatsApp'tan gönderip oradan da
kopyalayabilirsin. Yanlış bir şey olursa bildirimdeki **Geri al**'a dokun ya da
Ayarlar → Yedekleme → **Otomatik yerel sürümler**'den önceki hale dön.

> Eski uygulamadaki ödeme işaretleri yeni uygulamada hesap defterine
> ("Ödedi" kayıtları) dönüşür; biriken borçlar birebir aynı kalır. Bu, otomatik
> testlerle eski uygulamanın kendi hesabıyla karşılaştırılarak doğrulanır.

---

## 3. Cihazlar arası eşitleme

Telefonda, bilgisayarda, hangi cihazda açarsan aç veriler güncel olsun diye
uygulama verileri senin Firebase projende (Google) saklar ve eşitler.

**Her cihazda bir kez:** Daha → Ayarlar → **Cihazlar arası eşitleme** →
**Google ile giriş yap**. (Henüz giriş yapılmamış cihazda üstte "Verilerin
başka bir cihazda mı?" şeridi de çıkar.)

- Cihazda zaten veri varsa buluttakiyle **birleştirilir**, hiçbir şey silinmez;
  birleştirmeden önce cihazdaki hâl otomatik yerel sürüm olarak saklanır.
- Her değişiklik birkaç saniye içinde gönderilir. Uygulama açılınca, öne gelince
  ve açık kaldıkça en geç 30 saniyede bir diğer cihazların değişiklikleri alınır.
- İnternet yokken uygulama aynen çalışır; bağlantı gelince eşitlenir. İki
  cihazda aynı anda farklı şeyler değiştirilirse ikisi de korunur (aynı alan
  iki yerde değiştiyse son yapılan geçerli olur).
- Üst köşedeki rozet durumu gösterir: **Eşitlendi**, **Eşitleniyor**,
  **Çevrimdışı**.
- **iPhone'da ana ekrandaki uygulamada** Google penceresi açılmazsa: başka bir
  cihazda Google ile giriş yap → Eşitleme → **Şifre belirle**; iPhone'da
  **E-posta ve şifreyle giriş**'i kullan.
- **Çıkış yap** dersen veriler cihazda kalır, yalnızca eşitleme durur.

Güvenlik: Verine yalnızca kendi Google hesabınla erişilir (Firestore kuralı:
herkes yalnızca kendi verisini okur/yazar, `firestore.rules`). Veriler bu
repoya hiçbir zaman girmez.

### Firebase kurulumu (bir kez, bilgisayardan ~10 dakika)

1. <https://console.firebase.google.com> → **Proje oluştur** → ad: `halisaha`
   (Gemini ve Google Analytics'i kapat/atla).
2. **Build → Authentication → Başlayın**:
   - **Google** → Etkinleştir → destek e-postası seç → Kaydet.
   - **Yeni sağlayıcı ekle → E-posta/Şifre** → ilk anahtarı aç → Kaydet.
   - **Ayarlar → Yetkili alan adları → Alan adı ekle** →
     `ataberksertbastr-tr34.github.io`.
3. **Build → Firestore Database → Veritabanı oluştur** → Standard, Avrupa'da
   bir konum, **Üretim modunda başlat**.
4. Firestore → **Kurallar** → [`firestore.rules`](firestore.rules) içeriğini
   yapıştır → **Yayınla**.
5. ⚙️ **Proje ayarları → Uygulamalarınız → `</>`** → takma ad → **Uygulamayı
   kaydet** → çıkan `firebaseConfig` değerlerini `src/sync/config.ts` içindeki
   `BUILT_IN`'e yaz ve `main`'e gönder. (Kod değiştirmeden denemek için aynı
   metni uygulamada Ayarlar → Eşitleme kutusuna da yapıştırabilirsin; o zaman
   yalnızca o cihazda geçerli olur.)

`firebaseConfig` gizli değildir (apiKey bir şifre değil, projenin herkese açık
kimliğidir); veriyi 4. adımdaki kural korur.

---

## 4. Yedekleme (önemli)

Veriler cihazında saklanır. Eşitleme açık değilse telefon kaybolduğunda ya da
tarayıcı verisi silindiğinde veriler gider; bu yüzden **düzenli yedek al**.
Eşitleme açıksa veriler bulutta da durur; yine de arada bir yedek almak iyidir.

- **Yedeği paylaş:** Ayarlar → Yedekleme → **Yedeği paylaş**. Yedek dosyasını
  (`halisaha-yedek-YYYY-AA-GG.json`) WhatsApp'ta kendine, Google Drive'a ya da
  e-postaya gönder. Paylaşım yoksa dosya indirilir.
- **Dosya olarak indir** ve **Yedeği kopyala** (metin) seçenekleri de var.
- **Hatırlatma:** 7 gün yedek almazsan üstte "Yedek alma zamanı" şeridi
  çıkar (eşitleme çalışıyorsa 30 günde bir).
- **Otomatik yerel sürümler:** Her değişiklik telefonda otomatik kaydedilir,
  son 10 sürüm saklanır; silme, iptal, yedek yükleme gibi işlemlerden önce ayrıca
  sürüm alınır. Ayarlar → Yedekleme → **Otomatik yerel sürümler**.

**Geri yükleme:** Ayarlar → Yedekleme → **Yedekten yükle** → **Dosya seç**
(yedek dosyasını seç) ya da metni yapıştır → **Yükle**.

> Yedek dosyaları kişisel veri içerir (isim, telefon, IBAN). Paylaşırken dikkat
> et; bu repoya asla eklenmez.

---

## 5. Neler yapabilirsin?

- **Etkinlikler (Kısım 3):** "+ Yeni etkinlik" ile halı saha, paintball,
  airsoft, voleybol, ayak tenisi, masa tenisi, kıraathane ya da diğer etkinlik.
  Her türün kontenjanı, katılım kesinleşme süresi (Kural 15.3), hazırlık listesi
  (maske, krono, brifing, ön ödeme…), yönetmeliğin "önceden anlaşılır" dediği
  konular (Kural 3.5, 4.1, 6.2, 16.6, 17.5, 18.2, 19.1, 20.7, 21.4…), brifing
  mesajı ve araç paylaşımı
  (yakıt/geçiş kişi başı, Kural 15.8) var.
- **Sonuçlar türe göre:** halı sahada maç saati (60 dk / 2×30, devre arası ve
  kaleci değişimi hatırlatması), gol ve maçın oyuncusu; paintball/airsoft'ta
  raunt sayacı; voleybol, ayak tenisi ve masa tenisinde servis takipli
  skorbord (25-25-15, 2 fark, 11'lik oyunlar, 10-10 sonrası servis); kıraathanede
  masa sonuçları ve tavla (mars 2 sayı).
- **Kura:** ayak tenisi tekli/çiftli/üçlü dengeli takım kurası, masa tenisi
  "kazanan kalır" sırası (üst üste sınır), kıraathane masa ve eş kurası
  (okey, 101, batak, king, pişti, tavla).
- **Disiplin (Bölüm 9, Ek tablo):** ihlal kaydı; yönetmeliğin öngördüğü yaptırım
  önerilir (1. uyarı → 2. bir maç ceza → 3. davet edilmez; kavga, replika,
  maske, alkol, zarar bedeli…). Cezalı, uzaklaştırılmış ya da borçlu kişi
  listeye yazılırken sorulur; son söz organizatörün (Kural 12.1).
- **Duyurular:** uygulamaya geçiş (Kural 14.3), iptal (1.9), kural değişikliği
  (12.2) ve grup kuralları hatırlatması için hazır, düzenlenebilir metinler.
- **Maç:** haftalık günlere göre ileriye 4 maç otomatik planlanır; katılım
  (Var / Belki / Yok / Geç iptal), yedek listesi, misafir (getiren kişiyle),
  "Geçen haftayı kopyala", sabit oyuncular, saha haritası/yol tarifi/arama,
  "Sahayı rezerve ettim" ve hatırlatması, takvime ekleme (Google Takvim / .ics),
  gol ve maçın oyuncusu, habersiz gelmeyenler.
- **Kurallarla uyum:** maça 24 saatten az kala "Yok" diyen geç iptal sayılır
  (Kural 1.5), habersiz gelmeyen sonraki maçta sıranın sonuna (Kural 1.6),
  borçlu oyuncu yazılırken sorulur (Kural 2.4), kaleciler ücretsiz (Kural 2.1),
  pay 5 ₺'ye yukarı yuvarlanır (Kural 2.2). İkisi de Ayarlar'dan kapatılabilir.
- **Takımlar:** güç + mevki + kaleci dengeli otomatik kurma, elle kurma, sahada
  sürükle-bırak takas, oyuncuyu takıma kilitleme, "aynı takımda olsun/olmasın"
  kuralları, geçen maçın takımlarını tekrar etmeme, maç sonuçlarından performans
  puanı (Elo, senin verdiğin seviyeyle harmanlanır, kapatılabilir).
- **Ödemeler:** maç bazlı takip, muafiyet, kişi bazlı hesap defteri (kısmi
  ödeme, avans, iade), biriken borçlar, kişiye özel WhatsApp hatırlatma, aylık
  özet, organizatör giderleri (top, yelek, su) ve kasa durumu. Etkinliklerde
  kişiye ya da herkese eşit bölünen ek harcamalar (boya, mermi, masa; Kural 15.4).
- **Paylaşım:** davet, kadro, takım, brifing, araç, iptal ve ödeme mesajları
  tek dokunuşla WhatsApp'a. Halı saha şablonları Ayarlar'dan düzenlenebilir;
  diğer etkinliklerin mesajları türüne göre hazır gelir. Takım adları ve yelek
  renkleri Ayarlar'dan seçilir.
- **İstatistik:** oyuncu kartı (disiplin sicili dahil), sezon tablosu, en çok
  maça gelenler, gol krallığı, güvenilirlik puanı, etkinlik tablosu.
- **Kurallar:** KURALLAR.md uygulamada kapak, kısımlar, altın kurallar,
  "Sıfır tolerans / Güvenlik" vurguları ve yaptırımlar tablosuyla; aranabilir,
  maddeler arası bağlantılı, her madde numarasıyla ("Kural 2.3") paylaşılır.
- **Geri al:** silme, iptal, takım değişikliği gibi her işlemden sonra.
- Türkçe / İngilizce, açık (fildişi) / koyu (gece) tema; Predators renkleri
  (gece siyahı, altın, bordo, krem).

---

## 6. Geliştirici notları

Organizatörün bu bölümle işi yok; test, derleme ve yayın GitHub Actions'ta
otomatik çalışır.

**Teknoloji:** Vite + TypeScript. Veriler IndexedDB'de; service worker tüm
dosyaları önbelleğe alır. Tek çalışma zamanı bağımlılığı Firebase Auth'tur
(`firebase`); yalnızca giriş yapılmış ya da giriş istenen cihazda, ayrı bir
dosya olarak sonradan yüklenir. Firestore'a SDK'sız REST ile erişilir
(`src/sync/firestore.ts`). Yönlendirme hash
tabanlıdır (`#/match`, `#/rules/2.3`), GitHub Pages'te ek ayar gerekmez; taban yol
görelidir (`base: "./"`), `/halisaha/` altında da özel alan adında da çalışır.

```bash
npm ci            # bağımlılıklar
npm run dev       # geliştirme sunucusu
npm run typecheck # TypeScript kontrolü
npm test          # birim testleri (Vitest)
npm run build     # dist/ (service worker dahil)
npm run e2e       # uçtan uca testler (Playwright, derlenmiş uygulama üzerinde)

# Eşitleme testleri: Firebase emülatörleri (Java 21 gerekir)
npm run build:emu
npx firebase-tools emulators:exec --only auth,firestore --project demo-halisaha \
  "npm run test:emu && npm run e2e:sync"
```

**Klasörler**

| Yol | İçerik |
|---|---|
| `src/domain/` | Saf iş mantığı: kadro, pay/borç, hesap defteri, takım kurma, Elo, planlama, takvim, şablonlar, kurallar, şema ve migration; etkinlik türleri (`kinds.ts`), skor motoru (`scoring.ts`), kura ve sıra (`draw.ts`), araçlar (`cars.ts`), disiplin (`discipline.ts`), takım görünümü (`teamstyle.ts`) |
| `src/data/` | IndexedDB, otomatik yerel sürümler, yedek dosyası |
| `src/sync/` | Cihazlar arası eşitleme: üç yönlü birleştirme (`merge.ts`), eşitleme motoru (`engine.ts`), Firestore REST (`firestore.ts`), bulut belgesi (`envelope.ts`), Firebase girişi (`auth.ts`), yapılandırma (`config.ts`) |
| `src/ui/` | Görünümler, alt sayfalar, saha çizimi ve sürükle-bırak |
| `src/app/` | Durum (Geri al dahil), eylemler, yönlendirme |
| `src/sw.ts`, `scripts/vite-plugin-sw.ts` | Service worker ve önbellek listesi |
| `legacy/index.html` | Eski uygulama (yalnızca uyumluluk testleri için, yayınlanmaz) |
| `tests/`, `e2e/` | Vitest ve Playwright testleri, uydurma isimli fikstürler |

**Veri şeması:** Güncel sürüm `src/domain/schema.ts` → `SCHEMA_VERSION`. Şema
değişirse sürüm artar, `src/domain/migrate.ts`'e adım ve test eklenir. Eski
uygulamanın v1/v2 yedekleri `tests/migrate.test.ts` ve
`e2e/legacy-compat.spec.ts` ile sürekli doğrulanır (ikincisi eski uygulamayı
gerçek tarayıcıda kullanıp yedeğini yeni uygulamaya yükler).

**Eşitleme nasıl çalışır:** Firestore'da hesap başına tek belge
(`users/{uid}/halisaha/state`, gzip + base64). Her cihaz buluttakiyle en son
anlaştığı hâli ("taban") saklar; bulut değiştiyse taban–cihaz–bulut üç yönlü
birleştirilir (kayıtlar `id` ile, alanlar tek tek; silme ile düzenleme çakışırsa
düzenleme korunur). Yazmalar ön koşulludur (`updateTime`); araya başka cihaz
girerse yeniden okunur. Otomatik planlanan maçların kimliği tarih/saatten
türetilir, iki cihaz aynı maçı ayrı ayrı oluşturmaz.

**Kuralları güncellemek:** `KURALLAR.md` dosyasını düzenleyip `main`'e gönder;
uygulamanın Kurallar sayfası bir sonraki yayında güncellenir.

**Yayın:** `main`'e her merge'de `.github/workflows/ci.yml` testleri çalıştırır
ve geçerse GitHub Pages'e yayınlar. İlk seferde depo ayarlarında
**Settings → Pages → Source: GitHub Actions** seçilmelidir.

**Arma ve ikonlar:** `brand/predators-crest.png` kaynak; ikonlar
`scripts/make-icons.ts` ile üretilir, üst bölümdeki arma `public/brand/crest.webp`.

**Fontlar:** Barlow ve Barlow Condensed (SIL Open Font License 1.1,
`src/assets/fonts/OFL.txt`) uygulamaya gömülüdür.
