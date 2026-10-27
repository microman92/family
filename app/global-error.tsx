'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body>
        <main>
          <h1>Не удалось загрузить Family</h1>
          <p>Попробуйте обновить страницу.</p>
          <button onClick={reset}>Попробовать ещё раз</button>
        </main>
      </body>
    </html>
  );
}
