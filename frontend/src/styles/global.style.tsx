const GlobalStyle = () => {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          a { color: inherit; text-decoration: none; }
          [data-mantine-color-scheme='dark'] table.md, [data-mantine-color-scheme='dark'] table.md th:nth-of-type(odd), [data-mantine-color-scheme='dark'] table.md td:nth-of-type(odd) {
            background: rgba(50, 50, 50, 0.5);
          }
          [data-mantine-color-scheme='light'] table.md, [data-mantine-color-scheme='light'] table.md th:nth-of-type(odd), [data-mantine-color-scheme='light'] table.md td:nth-of-type(odd) {
            background: rgba(220, 220, 220, 0.5);
          }
          table.md td {
            padding-left: 0.5em;
            padding-right: 0.5em;
          }
          video::-webkit-media-controls-fullscreen-button {
            display: none !important;
          }
        `,
      }}
    />
  );
};
export default GlobalStyle;
