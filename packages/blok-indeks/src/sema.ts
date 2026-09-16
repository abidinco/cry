/**
 * Blok indeksinin ClickHouse şeması ve satır→sütun dönüşümü.
 *
 * Motor kararı (kullanıcı, 2026-09-16): ClickHouse. Ölçüm ve gerekçe
 * docs/yol-haritasi-blok-indeks.md §1 "B0 ölçümleri" — 34,5–52,1 bayt/satır,
 * yoğun adres sorgusu 13–14 ms; Postgres aynı veride 324,5 bayt ve ~490 ms.
 *
 * Şemanın kararları:
 * - `kimden`/`kime` 20 baytlık SABİT uzunlukta ikili (base58 metin değil): metin biçimi
 *   34 karakter ve her satırda tekrar ederdi. Gösterim sınırında base58'e çevrilir.
 * - `tutar UInt256`: zincirde 2^256-1 değerler gerçekten var (canlı veride görüldü).
 * - Sıralama `(kime, zaman, tx, idx)`: indeksin ASIL sorusu "bu adrese kim gönderdi".
 *   `kimden` sorgusu ikinci bir sıralı kopya (projeksiyon) olmadan 18–34 ms — ölçüldü,
 *   diski iki katına çıkarmaya değmiyor.
 * - `ReplacingMergeTree` + tekillik anahtarı sıralamanın içinde: aynı aralığı iki kez
 *   yazmak zararsız olmalı, çünkü kursör yarım kalan aralığı yeniden kuyruğa atar.
 * - Aylık bölüm: pencere dışını silmek tek `DROP PARTITION`.
 */
import type { AyristirmaSonucu, IndeksSatiri, Varlik } from "./ayristir.js";

export const VARLIK_KODU: Record<Varlik, number> = { TRX: 1, USDT: 2 };

export const TABLO = "blok_indeks";

export const SEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${TABLO} (
  blok   UInt32                       CODEC(Delta, ZSTD(3)),
  zaman  DateTime                     CODEC(Delta, ZSTD(3)),
  tx     FixedString(32)              CODEC(ZSTD(3)),
  idx    UInt16                       CODEC(ZSTD(3)),
  varlik Enum8('TRX' = 1, 'USDT' = 2),
  kimden FixedString(20)              CODEC(ZSTD(3)),
  kime   FixedString(20)              CODEC(ZSTD(3)),
  tutar  UInt256                      CODEC(ZSTD(3))
) ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(zaman)
ORDER BY (kime, zaman, tx, idx)
`.trim();

/**
 * KAPSAM: okunan her blok için bir satır — 0 transferli blok DAHİL.
 *
 * "Yok" ile "bakılamadı" ayrı cevaplardır (CLAUDE.md). `blok_indeks`te satırı olmayan bir blok,
 * transfer taşımadığı için mi yoksa hiç okunmadığı için mi boş, oradan anlaşılamaz. Bu tablo o
 * soruyu cevaplar; yeniden başlatma da (atlanacak bloklar) boşluk listesi de buradan hesaplanır.
 *
 * Sıra kuralı: bir bloğun kapsam satırı, transfer satırları YAZILDIKTAN SONRA yazılır. Arada
 * ölürse blok "okunmadı" kalır ve yeniden yazılır — tekillik bunu zararsız kılar. Tersi sırada
 * ölmek, okunmamış bir bloğu okunmuş gösterirdi.
 *
 * Sayaçlar ayrıştırıcının sayaçlarıdır: elenen hiçbir şey sessiz kalmaz.
 */
export const KAPSAM_TABLO = "blok_okundu";

export const KAPSAM_SEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${KAPSAM_TABLO} (
  blok                  UInt32   CODEC(Delta, ZSTD(3)),
  zaman                 DateTime CODEC(Delta, ZSTD(3)),
  satir                 UInt32   CODEC(ZSTD(3)),
  islem                 UInt32   CODEC(ZSTD(3)),
  basarisiz_islem       UInt32   CODEC(ZSTD(3)),
  transfer_olmayan_olay UInt32   CODEC(ZSTD(3)),
  kapsam_disi_token     UInt32   CODEC(ZSTD(3)),
  okundu                DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(okundu)
ORDER BY blok
`.trim();

/** Kurulum sırası önemli değil; ikisi de IF NOT EXISTS. */
export const SEMALAR = [SEMA_SQL, KAPSAM_SEMA_SQL] as const;

export const KAPSAM_EKLE_SQL = `
INSERT INTO ${KAPSAM_TABLO} (blok, zaman, satir, islem, basarisiz_islem, transfer_olmayan_olay, kapsam_disi_token)
SELECT blok, toDateTime(zaman), satir, islem, basarisiz_islem, transfer_olmayan_olay, kapsam_disi_token
FROM input('blok UInt32, zaman UInt32, satir UInt32, islem UInt32, basarisiz_islem UInt32, transfer_olmayan_olay UInt32, kapsam_disi_token UInt32')
FORMAT JSONCompactEachRow
`.trim();

/** Ayrıştırma sonucunu kapsam satırına çevirir — sütun sırası `KAPSAM_EKLE_SQL` ile aynı. */
export function kapsamDizisi(r: AyristirmaSonucu): [number, number, number, number, number, number, number] {
  return [r.blok, r.zaman, r.satirlar.length, r.sayac.islem, r.sayac.basarisizIslem, r.sayac.transferOlmayanOlay, r.sayac.kapsamDisiToken];
}

/**
 * Satırı ClickHouse'un JSONCompactEachRow biçimine çevirir.
 * Tutar METİN olarak gider: JSON sayısı 2^53'te taşar ve bu sessiz bir kayıptır.
 */
export function satirDizisi(s: IndeksSatiri): [number, number, string, number, number, string, string, string] {
  return [s.blok, s.zaman, s.tx, s.idx, VARLIK_KODU[s.varlik], s.kimden, s.kime, s.tutar.toString()];
}

/** INSERT'in sütun sırası — `satirDizisi` ile BİREBİR aynı olmalı. */
export const SUTUNLAR = ["blok", "zaman", "tx", "idx", "varlik", "kimden", "kime", "tutar"] as const;

/**
 * Hex metinleri ikiliye çeviren INSERT. `input()` ile geldiği için istemci ham hex gönderir,
 * dönüşüm sunucuda olur — istemcide bayt dizisi kurmak bir kopya daha demek.
 */
export const EKLE_SQL = `
INSERT INTO ${TABLO} (${SUTUNLAR.join(", ")})
SELECT blok, toDateTime(zaman), unhex(tx), idx, varlik, unhex(kimden), unhex(kime), toUInt256(tutar)
FROM input('blok UInt32, zaman UInt32, tx String, idx UInt16, varlik UInt8, kimden String, kime String, tutar String')
FORMAT JSONCompactEachRow
`.trim();
