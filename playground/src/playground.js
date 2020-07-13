// Copyright 2020 The AMPHTML Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import './modes/embed.critical.scss';

import DocumentController from './document/controller.js';
import Fab from './fab/fab.js';

import * as AutoImporter from './auto-importer/auto-importer.js';
import * as ComponentsProvider from './components-provider/components-provider.js';
import * as EmailLoader from './email-loader/email-loader.js';
import * as CspHashCalculator from './csp-hash-calculator/csp-hash-calculator.js';
import * as ErrorList from './error-list/error-list.js';
import * as StateView from './state-view/state-view.js';
import * as ImportURL from './import-url/import-url.js';
import * as ValidationResult from './validation-result/validation-result.js';
import * as Validator from './validator/validator.js';
import * as Editor from './editor/editor.js';
import * as Preview from './preview/preview.js';
import * as Button from './button/button.js';
import * as Menu from './menu/base.js';

import createSelector from './selector/selector.js';
import createTemplateDialog from './template-dialog/base.js';
import createShareAction from './share/';
import params from './params/base.js';
import events from './events/events.js';
import modes from './modes/index.js';
import titleUpdater from './title-updater/base.js';
import snackbar from './snackbar/base.js';
import {runtimes, EVENT_SET_RUNTIME} from './runtime/runtimes.js';
import detectRuntime from './runtime/detector.js';
import addSplitPaneBehavior from './split-pane/base.js';
import formatter from './formatter/';

import './analytics';
import './service-worker/base.js';

// create editing/panels
const editor = Editor.createEditor(document.getElementById('source'), window);
const preview = Preview.createPreview(document.getElementById('preview'));
addSplitPaneBehavior(document.querySelector('main'));

ImportURL.createURLImport();

// configure state list behavior
const stateIndicator = document.getElementById('preview-header-state');
const stateListContainer = document.getElementById('state-view');
StateView.createStateView(stateListContainer, stateIndicator);

ErrorList.createErrorList();
ValidationResult.createValidationResult();

const validator = Validator.createValidator();

const componentsProvider = ComponentsProvider.createComponentsProvider();

// Create AMP component auto-importer
const autoImporter = AutoImporter.createAutoImporter(
  componentsProvider,
  editor
);

const emailLoader = EmailLoader.createEmailLoader(editor);

const cspHashCalculator = CspHashCalculator.createCspHashCalculator(editor);

// runtime select
const runtimeChanged = (runtimeId) => {
  const newRuntime = runtimes.get(runtimeId);
  if (!newRuntime) {
    console.error('unknown runtime: ' + newRuntime);
    return;
  }
  events.publish(EVENT_SET_RUNTIME, newRuntime);
};

const runtimeSelector = createSelector(
  document.getElementById('runtime-select'),
  {
    classes: ['caret-right'],
    id: 'runtime',
    label: 'select runtime',
    values: runtimes.values.map((r) => {
      return {
        id: r.id,
        label: r.name,
        selected: r === runtimes.activeRuntime,
      };
    }),
    onChange: runtimeChanged,
  }
);
runtimeSelector.show();

let activeRuntime;
events.subscribe(EVENT_SET_RUNTIME, (newRuntime) => {
  runtimeSelector.selectOption(newRuntime.id);
  // change editor input to new runtime default if current input is unchanged
  if (
    activeRuntime &&
    activeRuntime != newRuntime &&
    activeRuntime.template === editor.getSource()
  ) {
    editor.setSource(newRuntime.template);
  }
  validator.validate(editor.getSource());
  activeRuntime = newRuntime;

  const emailButton = document.getElementById('import-email');
  if (emailButton) {
    emailButton.classList.toggle('hidden', activeRuntime.id !== 'amp4email');
  }
});

runtimes.init();

// configure editor
const editorUpdateListener = () => {
  const source = editor.getSource();

  if (preview) {
    preview.refresh(source);
  }

  validator.validate(source);
  titleUpdater.update(source);

  if (!modes.IS_VALIDATOR) {
    cspHashCalculator.update(source);
  }
};
events.subscribe([Editor.EVENT_INPUT_CHANGE], editorUpdateListener);
events.subscribe(Validator.EVENT_NEW_VALIDATION_RESULT, (validationResult) => {
  editor.setValidationResult(validationResult);
});
events.subscribe([Editor.EVENT_INPUT_NEW], () => {
  const source = editor.getSource();
  const runtime = detectRuntime(source);
  runtimeChanged(runtime.id);
  editorUpdateListener();
});

// configure auto-importer
events.subscribe(Validator.EVENT_NEW_VALIDATION_RESULT, (validationResult) => {
  autoImporter.update(validationResult);
});

// setup document
const documentController = new DocumentController(
  editor,
  runtimes.activeRuntime,
  document.querySelector('header'),
  window
);
documentController.show();

// configure preview
if (preview) {
  const previewPanel = document.getElementById('preview');
  const showPreview = new Fab(document.body, '▶&#xFE0E;', () => {
    params.push('preview', true);
    previewPanel.classList.add('show');
    if (embedMode.isActive) {
      hidePreviewFab.show();
    }
  });

  const closePreview = () => {
    params.push('preview', false);
    previewPanel.classList.remove('show');
    showPreview.show();
    if (embedMode.isActive) {
      hidePreviewFab.hide();
    }
  };
  const hidePreviewFab = new Fab(document.body, '✕&#xFE0E;', closePreview);
  const hidePreviewButton = document.getElementById('preview-header-close');
  hidePreviewButton.addEventListener('click', closePreview);

  window.onpopstate = () => {
    if (!params.get('preview')) {
      previewPanel.classList.remove('show');
      showPreview.show();
    }
  };

  showPreview.show();
}

// eslint-disable-next-line no-unused-vars
const templateDialog = createTemplateDialog(loadTemplateButton, {
  onStart: () => editor.showLoadingIndicator(),
  onSuccess: (template) => {
    editor.setSource(template.content);
    params.replace('url', template.url);
  },
  onError: (err) => {
    snackbar.show(err);
  },
});

// load template dialog
const loadTemplateButton = Button.from(
  document.getElementById('document-title'),
  () => templateDialog.open(runtimes.activeRuntime)
);

// create the share action
const shareDialog = createShareAction(editor);
Button.from(document.getElementById('share'), () => {
  shareDialog.open();
});

// configure menu
const menu = Menu.create();
Button.from(document.getElementById('show-menu'), () => {
  menu.show();
});

const formatSource = () => {
  formatter
    .format(editor.getSource())
    .then((formattedCode) => editor.setSource(formattedCode));
};
Button.from(document.getElementById('format-source'), formatSource);
Button.from(document.getElementById('menu-format-source'), formatSource);

const loadEmail = () => {
  emailLoader
    .loadEmailFromFile()
    .then(formatSource)
    .catch((error) => alert(`Error loading email: ${error.message}`));
};
Button.from(document.getElementById('import-email'), loadEmail);
