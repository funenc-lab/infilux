(() => {
  const locale = document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const title =
    locale === 'zh' ? '\u6b63\u5728\u6062\u590d\u5de5\u4f5c\u533a' : 'Restoring workspace';
  const description =
    locale === 'zh'
      ? '\u6b63\u5728\u52a0\u8f7d\u8bbe\u7f6e\u548c\u4ed3\u5e93\u4e0a\u4e0b\u6587\u3002'
      : 'Loading settings and repository context.';
  const copyElement = document.querySelector('[data-startup-eyebrow]');
  const titleElement = document.querySelector('.bootstrap-title');
  const descriptionElement = document.querySelector('.bootstrap-description');

  if (copyElement) {
    copyElement.setAttribute('data-startup-title', title);
  }
  if (titleElement) {
    titleElement.textContent = title;
  }
  if (descriptionElement) {
    descriptionElement.textContent = description;
  }
})();
