# Halı Saha Organizatörü

Haftalık halı saha maçlarını organize etmek için telefonun ana ekranına kurulan,
**internetsiz de çalışan** uygulama: kadro, yedek listesi, takımlar, saha,
ödemeler, kasa, istatistikler ve grup kuralları tek yerde.

**Uygulama adresi:** <https://ataberksertbastr-tr34.github.io/halisaha/>

> Telefonuna hiçbir şey kurman gerekmez (uygulama mağazası yok). Adresi açıp
> "Ana ekrana ekle" demen yeterli. Veriler yalnızca senin telefonunda durur.

---

## 1. Telefona kurulum

### Android (Chrome)

1. Chrome'da uygulama adresini aç.
2. Üstte **Yükle** düğmesi çıkar (ya da Chrome menüsü ⋮ → **Uygulamayı yükle**).
3. Onayla. Ana ekranda yeşil-sarı-turuncu top ikonuyla **Halı Saha** belirir.

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

## 3. Yedekleme (önemli)

Veriler telefonunda saklanır. Telefon kaybolur ya da tarayıcı verisi silinirse
veriler gider; bu yüzden **düzenli yedek al**.

- **Yedeği paylaş:** Ayarlar → Yedekleme → **Yedeği paylaş**. Yedek dosyasını
  (`halisaha-yedek-YYYY-AA-GG.json`) WhatsApp'ta kendine, Google Drive'a ya da
  e-postaya gönder. Paylaşım yoksa dosya indirilir.
- **Dosya olarak indir** ve **Yedeği kopyala** (metin) seçenekleri de var.
- **Haftalık hatırlatma:** 7 gün yedek almazsan üstte "Yedek alma zamanı"
  şeridi çıkar.
- **Otomatik yerel sürümler:** Her değişiklik telefonda otomatik kaydedilir,
  son 10 sürüm saklanır; silme, iptal, yedek yükleme gibi işlemlerden önce ayrıca
  sürüm alınır. Ayarlar → Yedekleme → **Otomatik yerel sürümler**.

**Geri yükleme:** Ayarlar → Yedekleme → **Yedekten yükle** → **Dosya seç**
(yedek dosyasını seç) ya da metni yapıştır → **Yükle**.

> Yedek dosyaları kişisel veri içerir (isim, telefon, IBAN). Paylaşırken dikkat
> et; bu repoya asla eklenmez.

---

## 4. Neler yapabilirsin?

- **Maç:** haftalık günlere göre ileriye 4 maç otomatik planlanır; katılım
  (Var / Belki / Yok / Geç iptal), yedek listesi, misafir (getiren kişiyle),
  "Geçen haftayı kopyala", sabit oyuncular, saha haritası/yol tarifi/arama,
  "Sahayı rezerve ettim" ve hatırlatması, takvime ekleme (Google Takvim / .ics),
  gol ve maçın oyuncusu, habersiz gelmeyenler.
- **Kurallarla uyum:** maça 24 saatten az kala "Yok" diyen geç iptal sayılır
  (Kural 1.5), borçlu oyuncu "Var" yazılınca uyarı (Kural 2.4), kaleciler
  ücretsiz (Kural 2.1), pay 5 ₺'ye yukarı yuvarlanır (Kural 2.2).
- **Takımlar:** güç + mevki + kaleci dengeli otomatik kurma, elle kurma, sahada
  sürükle-bırak takas, oyuncuyu takıma kilitleme, "aynı takımda olsun/olmasın"
  kuralları, geçen maçın takımlarını tekrar etmeme, maç sonuçlarından performans
  puanı (Elo, senin verdiğin seviyeyle harmanlanır, kapatılabilir).
- **Ödemeler:** maç bazlı takip, muafiyet, kişi bazlı hesap defteri (kısmi
  ödeme, avans, iade), biriken borçlar, kişiye özel WhatsApp hatırlatma, aylık
  özet, organizatör giderleri (top, yelek, su) ve kasa durumu.
- **Paylaşım:** davet, kadro, takım ve ödeme mesajları tek dokunuşla WhatsApp'a;
  şablonlar Ayarlar'dan düzenlenebilir.
- **İstatistik:** oyuncu kartı, sezon tablosu, en çok maça gelenler, gol krallığı,
  güvenilirlik puanı.
- **Kurallar:** KURALLAR.md uygulamada aranabilir; her madde numarasıyla
  ("Kural 2.3") tek dokunuşla paylaşılır.
- **Geri al:** silme, iptal, takım değişikliği gibi her işlemden sonra.
- Türkçe / İngilizce, açık / koyu tema.

---

## 5. Geliştirici notları

Organizatörün bu bölümle işi yok; test, derleme ve yayın GitHub Actions'ta
otomatik çalışır.

**Teknoloji:** Vite + TypeScript, çalışma zamanı bağımlılığı yok. Veriler
IndexedDB'de; service worker tüm dosyaları önbelleğe alır. Yönlendirme hash
tabanlıdır (`#/match`, `#/rules/2.3`), GitHub Pages'te ek ayar gerekmez; taban yol
görelidir (`base: "./"`), `/halisaha/` altında da özel alan adında da çalışır.

```bash
npm ci            # bağımlılıklar
npm run dev       # geliştirme sunucusu
npm run typecheck # TypeScript kontrolü
npm test          # birim testleri (Vitest)
npm run build     # dist/ (service worker dahil)
npm run e2e       # uçtan uca testler (Playwright, derlenmiş uygulama üzerinde)
```

**Klasörler**

| Yol | İçerik |
|---|---|
| `src/domain/` | Saf iş mantığı: kadro, pay/borç, hesap defteri, takım kurma, Elo, planlama, takvim, şablonlar, kurallar, şema ve migration |
| `src/data/` | IndexedDB, otomatik yerel sürümler, yedek dosyası |
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

**Kuralları güncellemek:** `KURALLAR.md` dosyasını düzenleyip `main`'e gönder;
uygulamanın Kurallar sayfası bir sonraki yayında güncellenir.

**Yayın:** `main`'e her merge'de `.github/workflows/ci.yml` testleri çalıştırır
ve geçerse GitHub Pages'e yayınlar. İlk seferde depo ayarlarında
**Settings → Pages → Source: GitHub Actions** seçilmelidir.

**Fontlar:** Barlow ve Barlow Condensed (SIL Open Font License 1.1,
`src/assets/fonts/OFL.txt`) uygulamaya gömülüdür.
