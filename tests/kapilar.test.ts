import { describe, expect, it } from "vitest";
import { ACIK_YOLLAR, SIFRE_KAPISI_DISI } from "../apps/web/src/middleware.js";
import { sifreOlcutu, SIFRE_EN_AZ } from "../apps/web/src/lib/yetki.js";

describe("oturum kapısı", () => {
  it("giriş yolları oturumsuz açık kalır", () => {
    // Kapının kendisi kapalı olursa kimse giremez.
    expect(ACIK_YOLLAR).toContain("/giris");
    expect(ACIK_YOLLAR).toContain("/api/oturum/giris");
  });

  it("izleme senkronu oturum değil JETON ister, o yüzden listede", () => {
    // Servis bir tarayıcı değil; kendi koruması uç noktanın içinde.
    expect(ACIK_YOLLAR).toContain("/api/izleme/liste");
  });

  it("korumalı hiçbir yol yanlışlıkla açık değil", () => {
    for (const yol of ["/", "/yonetim", "/api/kullanici", "/api/detect"]) {
      expect(ACIK_YOLLAR).not.toContain(yol);
    }
  });
});

describe("ilk giriş şifre kapısı", () => {
  it("şifreyi DEĞİŞTİREN uç nokta kapının dışında kalmalı", () => {
    // Yaşandı: kapı bu uç noktayı da yönlendirince kullanıcı zorunluluğu
    // yerine getiremiyor ve hesap kilitleniyordu.
    expect(SIFRE_KAPISI_DISI).toContain("/api/oturum/sifre");
    expect(SIFRE_KAPISI_DISI).toContain("/sifre-degistir");
  });

  it("çıkış da açık kalır — kilitlenen kullanıcı en azından çıkabilmeli", () => {
    expect(SIFRE_KAPISI_DISI).toContain("/api/oturum/cikis");
  });

  it("yönetim ekranı bu kapının arkasında kalır", () => {
    expect(SIFRE_KAPISI_DISI).not.toContain("/yonetim");
  });
});

describe("oturum kullanıcıyı gömmez", () => {
  it("apiOturum kullanıcıyı veritabanından da doğrular", async () => {
    // Jetonun imzası geçerli olabilir ama kullanıcı kapatılmış ya da silinmiş
    // olabilir. Ölçüldü: silinmiş kullanıcının çerezi istekleri 500 ile
    // düşürüyordu; kapı artık kaydı soruyor.
    const kaynak = await import("node:fs/promises").then((f) =>
      f.readFile(new URL("../apps/web/src/lib/yetki.ts", import.meta.url), "utf8"),
    );
    expect(kaynak).toContain("prisma.user.findUnique");
    expect(kaynak).toContain("kullanici.active");
  });
});

describe("şifre ölçütü", () => {
  it("kısa şifreyi eler", () => {
    expect(sifreOlcutu("kisa")).not.toBeNull();
    expect(sifreOlcutu("a".repeat(SIFRE_EN_AZ - 1))).not.toBeNull();
  });

  it("yeterli uzunluktakini geçirir", () => {
    expect(sifreOlcutu("a".repeat(SIFRE_EN_AZ))).toBeNull();
    expect(sifreOlcutu("dogru-uzun-sifre")).toBeNull();
  });

  it("baştaki/sondaki boşluğu reddeder", () => {
    // Kopyala-yapıştırda yapışan boşluk, "şifre yanlış" diye geri döner.
    expect(sifreOlcutu(" bosluklu-sifre")).not.toBeNull();
    expect(sifreOlcutu("bosluklu-sifre ")).not.toBeNull();
  });
});

describe("kuyruk adlandırması", () => {
  it("kuyruk adı ve iş kimliği ':' TAŞIMAZ", async () => {
    // BullMQ ikisini de reddediyor ("cannot contain :") ve hata ancak iş
    // kuyruğa atılırken çıkıyor — yani çalışma anında, kullanıcının önünde.
    const { KUYRUK, indeksIsAnahtari, takipIsAnahtari } = await import(
      "../packages/kuyruk/src/index.js"
    );
    for (const ad of Object.values(KUYRUK)) expect(ad).not.toContain(":");
    expect(indeksIsAnahtari("tron", "TR7NHq")).not.toContain(":");
    expect(takipIsAnahtari("42")).not.toContain(":");
  });
});
