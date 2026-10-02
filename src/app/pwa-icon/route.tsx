import { ImageResponse } from "next/og";

export function GET(request: Request) {
  const size = new URL(request.url).searchParams.get("s") === "192" ? 192 : 512;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07111f",
        }}
      >
        <div
          style={{
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: size * 0.18,
            background: "#2f7bff",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: size * 0.42,
            fontWeight: 700,
          }}
        >
          P
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
