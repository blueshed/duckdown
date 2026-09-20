// A tiny in-memory S3 (path-style: /bucket/key) for testing S3Storage through
// Bun's real S3Client: ListObjectsV2, and GET/HEAD/PUT/DELETE of objects.
// It checks no signatures.
export function fakeS3() {
  const objects = new Map<string, Uint8Array<ArrayBuffer>>(); // "bucket/key" → bytes

  function list(bucket: string, prefix: string, delimiter: string): Response {
    const keys = [...objects.keys()]
      .filter((id) => id.startsWith(`${bucket}/${prefix}`))
      .map((id) => id.slice(bucket.length + 1))
      .sort();
    const contents: string[] = [];
    const prefixes = new Set<string>();
    for (const key of keys) {
      const cut = delimiter ? key.indexOf(delimiter, prefix.length) : -1;
      if (cut >= 0 && cut < key.length - 1) prefixes.add(key.slice(0, cut + 1));
      else contents.push(key);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucket}</Name><Prefix>${prefix}</Prefix><KeyCount>${contents.length + prefixes.size}</KeyCount><MaxKeys>1000</MaxKeys><Delimiter>${delimiter}</Delimiter><IsTruncated>false</IsTruncated>${
      contents.map((key) => `<Contents><Key>${key}</Key><LastModified>2026-09-19T00:00:00.000Z</LastModified><ETag>"x"</ETag><Size>${objects.get(`${bucket}/${key}`)!.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`).join("")
    }${[...prefixes].map((p) => `<CommonPrefixes><Prefix>${p}</Prefix></CommonPrefixes>`).join("")}</ListBucketResult>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });
  }

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const [, bucket = "", ...rest] = url.pathname.split("/");
      if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
        return list(bucket, url.searchParams.get("prefix") ?? "", url.searchParams.get("delimiter") ?? "");
      }
      const id = `${bucket}/${decodeURIComponent(rest.join("/"))}`;
      const body = objects.get(id);
      switch (req.method) {
        case "PUT":
          objects.set(id, new Uint8Array(await req.arrayBuffer()));
          return new Response(null, { headers: { ETag: '"x"' } });
        case "GET":
          return body ? new Response(body) : new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
        case "HEAD":
          return new Response(null, body ? { headers: { "Content-Length": String(body.length) } } : { status: 404 });
        case "DELETE":
          objects.delete(id);
          return new Response(null, { status: 204 });
      }
      return new Response("unsupported", { status: 400 });
    },
  });

  return { server, objects, endpoint: server.url.href.replace(/\/$/, "") };
}
