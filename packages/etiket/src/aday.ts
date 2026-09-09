/**
 * Kullanıcının verdiği aday borsa adresleri (karar: 2026-09-09).
 *
 * Neden arşive giriyorlar: bugün arşivde **tek bir borsa etiketi yok**, bu
 * yüzden takip motorunun `terminal` durma sebebi hiç ateşlenemiyor ve her
 * tarama "bütçe bitti" diye bitiyor — aracın var olma sebebi olan cümle
 * ("para şu borsaya girdi") hiç kurulamıyor.
 *
 * Neden "doğrulanmamış": adresler base58check/EIP-55 doğrulamasından geçiyor,
 * yani GERÇEK adresler. Ama adresin gerçek olması ETİKETİN doğru olduğu
 * anlamına gelmez — Paribu olduğu iddia edilen TRON adresi takip sitelerinde
 * borsa etiketi taşımıyor ve 2023 tarihli bir dolandırıcılık yazısında
 * listelenmiş. Etiket rapora "doğrulanmamış" ibaresiyle girer; sistem
 * on-chain davranışla test eder, onayı insan verir.
 *
 * Liste KAPALI ve her satır gerekçesini taşır. Genişletmek bir karardır,
 * kod değişikliğidir — keşif motoru (Görev 08) bulduğunu buraya değil
 * `deposit_candidates` tablosuna yazar.
 */

import type { TohumEtiket } from "./tipler";

const KAYNAK_NOT =
  "Kullanıcının verdiği aday liste (Gemini çıktısı). Adres biçimi doğrulandı, " +
  "etiket doğrulanmadı.";

export const ADAY_ETIKETLER: TohumEtiket[] = [
  {
    chain: "ethereum",
    address: "0xb5a46bc8b76fd2825aeb43db9c9e89e89158ecde",
    title: "BtcTurk (aday, doğrulanmamış)",
    description: KAYNAK_NOT,
    category: "exchange_hot",
    exchange: "BtcTurk",
    source: "kullanici",
    sourceUrl: null,
    confidence: 0.3,
    dogrulanmisMi: false,
    evidence: { iddia: "BtcTurk EVM hot wallet", not: KAYNAK_NOT },
  },
  {
    chain: "tron",
    address: "TD32z28Qmyz1zj3LfoYMGnfxPTbsVopCSj",
    title: "BtcTurk (aday, doğrulanmamış)",
    description: KAYNAK_NOT,
    category: "exchange_hot",
    exchange: "BtcTurk",
    source: "kullanici",
    sourceUrl: null,
    confidence: 0.3,
    dogrulanmisMi: false,
    evidence: { iddia: "BtcTurk TRON hot wallet", not: KAYNAK_NOT },
  },
  {
    chain: "ethereum",
    address: "0xbd8ef191caa1571e8ad4619ae894e07a75de0c35",
    title: "Paribu (aday, doğrulanmamış)",
    description: KAYNAK_NOT,
    category: "exchange_hot",
    exchange: "Paribu",
    source: "kullanici",
    sourceUrl: null,
    confidence: 0.3,
    dogrulanmisMi: false,
    evidence: { iddia: "Paribu EVM hot wallet", not: KAYNAK_NOT },
  },
  {
    chain: "tron",
    address: "TJEw7U8a4Asoh83EoB5Pk5YyfTadVZbb8h",
    title: "Paribu (aday, doğrulanmamış)",
    description: KAYNAK_NOT,
    category: "exchange_hot",
    exchange: "Paribu",
    source: "kullanici",
    sourceUrl: null,
    confidence: 0.3,
    dogrulanmisMi: false,
    evidence: {
      iddia: "Paribu TRON hot wallet",
      not: KAYNAK_NOT,
      uyari:
        "Takip sitelerinde borsa etiketi taşımıyor; 2023 tarihli bir " +
        "dolandırıcılık projesi yazısında listelenmiş. Onay öncesi on-chain " +
        "davranışa bakılmalı.",
    },
  },
];
