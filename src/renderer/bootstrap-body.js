(() => {
  const locale = document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const bootstrapMainStage = document.documentElement.dataset.bootstrapMainStage || null;
  const isWindowCreationStage =
    bootstrapMainStage === 'main-init-complete' ||
    bootstrapMainStage === 'main-window-created' ||
    bootstrapMainStage === 'hapi-auto-start-queued' ||
    bootstrapMainStage === 'auto-updater-initialized';
  const progressValue = isWindowCreationStage ? '34%' : '18%';
  const title =
    locale === 'zh' ? '\u6b63\u5728\u542f\u52a8\u684c\u9762\u5e94\u7528' : 'Starting desktop app';
  const description = isWindowCreationStage
    ? locale === 'zh'
      ? '\u6b63\u5728\u6253\u5f00\u684c\u9762\u7a97\u53e3\u3002'
      : 'Opening desktop window.'
    : locale === 'zh'
      ? '\u6b63\u5728\u51c6\u5907\u684c\u9762\u670d\u52a1\u3002'
      : 'Preparing desktop services.';
  const copyElement = document.querySelector('[data-startup-eyebrow]');
  const titleElement = document.querySelector('.bootstrap-title');
  const descriptionElement = document.querySelector('.bootstrap-description');

  document.documentElement.style.setProperty('--bootstrap-progress-value', progressValue);

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
