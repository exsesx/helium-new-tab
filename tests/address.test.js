import { describe, expect, test } from "bun:test";
import { searchDestination, websiteUrl } from "../src/lib/address.js";

describe("website URLs", () => {
  test("normalizes explicit http and https addresses", () => {
    expect(websiteUrl(" https://example.com/docs ")).toBe("https://example.com/docs");
    expect(websiteUrl("http://localhost:3000")).toBe("http://localhost:3000/");
  });

  test("rejects other schemes, bare hosts and embedded credentials", () => {
    for (const input of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///tmp/test",
      "example.com",
      "https://user:pass@example.com",
      "hello world",
      "",
    ]) {
      expect(() => websiteUrl(input)).toThrow();
    }
  });
});

describe("search destinations", () => {
  test("searches phrases and unsafe schemes", () => {
    expect(searchDestination("a quiet afternoon")).toEqual({ query: "a quiet afternoon" });
    expect(searchDestination("what is example.com")).toEqual({ query: "what is example.com" });
    expect(searchDestination("javascript:alert(1)")).toEqual({ query: "javascript:alert(1)" });
    expect(searchDestination("https://user:pass@example.com")).toEqual({
      query: "https://user:pass@example.com",
    });
    expect(searchDestination("   ")).toEqual({ query: "" });
  });

  test("opens public names with known top-level domains over HTTPS", () => {
    expect(searchDestination("example.com")).toEqual({ url: "https://example.com/" });
    expect(searchDestination("example.com/docs?q=1#top")).toEqual({
      url: "https://example.com/docs?q=1#top",
    });
    expect(searchDestination("EXAMPLE.org:8443")).toEqual({ url: "https://example.org:8443/" });
    expect(searchDestination("müller.de")).toEqual({ url: "https://xn--mller-kva.de/" });
    expect(searchDestination("HTTP://example.com")).toEqual({ url: "http://example.com/" });
  });

  test("searches file names and abbreviations with unknown suffixes", () => {
    for (const input of ["next.js", "vue.js", "config.yaml", "e.g.", "U.S.A", "user@example.com"]) {
      expect(searchDestination(input)).toEqual({ query: input });
    }
  });

  test("opens local hosts and IP addresses over HTTP", () => {
    for (const [input, url] of [
      ["localhost", "http://localhost/"],
      ["localhost:3000", "http://localhost:3000/"],
      ["localhost:3000?x=1", "http://localhost:3000/?x=1"],
      ["app.localhost:5173/login", "http://app.localhost:5173/login"],
      ["printer.local", "http://printer.local/"],
      ["router.home.arpa", "http://router.home.arpa/"],
      ["192.168.1.1", "http://192.168.1.1/"],
      ["192.168.1.10", "http://192.168.1.10/"],
      ["10.0.0.1:8080/status", "http://10.0.0.1:8080/status"],
      ["[::1]:3000", "http://[::1]:3000/"],
    ]) {
      expect(searchDestination(input)).toEqual({ url });
    }
  });

  test("searches numbers that are not IPv4 addresses", () => {
    for (const input of ["1.5", "3.14159", "256.1.1.1", "1.2.3"]) {
      expect(searchDestination(input)).toEqual({ query: input });
    }
  });
});
