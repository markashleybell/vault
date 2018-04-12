﻿import * as Handlebars from 'handlebars';
import * as $ from 'jquery';
import * as Cookies from 'js-cookie';
import {
    getPasswordSpecificationFromPassword,
    mapToSummary,
    parsePasswordSpecificationString,
    parseSearchQuery,
    rateLimit,
    searchCredentials,
    truncate,
    validateCredential,
    weakPasswordThreshold
} from './modules/all';
import {
    CryptoProvider,
    ICredential,
    ICredentialSummary,
    ICryptoProvider,
    IPasswordSpecification,
    IRepository,
    Repository
} from './types/all';

interface IVaultGlobals {
    // Base URL (used mostly for XHR requests, particularly when app is hosted as a sub-application)
    baseUrl: string;
    devMode: boolean;
}

interface IVaultUIElements {
    body: JQuery;
    loginFormDialog: JQuery;
    loginForm: JQuery;
    container: JQuery;
    controls: JQuery;
    modal: JQuery;
    modalContent: JQuery;
    newButton: JQuery;
    adminButton: JQuery;
    clearSearchButton: JQuery;
    searchInput: JQuery;
    spinner: JQuery;
}

interface IVaultUITemplates {
    urlLink: HandlebarsTemplateDelegate;
    urlText: HandlebarsTemplateDelegate;
    detail: HandlebarsTemplateDelegate;
    credentialForm: HandlebarsTemplateDelegate;
    deleteConfirmationDialog: HandlebarsTemplateDelegate;
    optionsDialog: HandlebarsTemplateDelegate;
    credentialTable: HandlebarsTemplateDelegate;
    credentialTableRow: HandlebarsTemplateDelegate;
    validationMessage: HandlebarsTemplateDelegate;
    modalHeader: HandlebarsTemplateDelegate;
    modalBody: HandlebarsTemplateDelegate;
    modalFooter: HandlebarsTemplateDelegate;
    copyLink: HandlebarsTemplateDelegate;
    exportedDataWindow: HandlebarsTemplateDelegate;
}

interface IVaultModalOptions {
    title: string;
    content: string;
    credentialId?: string;
    showAccept?: boolean;
    acceptText?: string;
    onaccept?: (e: JQuery.Event) => void;
    showClose?: boolean;
    closeText?: string;
    onclose?: (e: JQuery.Event) => void;
    showEdit?: boolean;
    editText?: string;
    onedit?: (e: JQuery.Event) => void;
    showDelete?: boolean;
    deleteText?: string;
    ondelete?: (e: JQuery.Event) => void;
}

declare var _VAULT_GLOBALS: IVaultGlobals;

const repository = new Repository(_VAULT_GLOBALS.baseUrl);
const cryptoProvider = new CryptoProvider();

const internal: any = {
    masterKey: '',      // Master key for Passpack encryption (Base64 encoded hash of (password + hashed pasword))
    password: '',       // Current user's password
    userId: ''          // GUID identifying logged-in user
};

const encryptionExcludes = ['CredentialID', 'UserID'];

const defaultPasswordSpecification: IPasswordSpecification = {
    length: 16,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true
};

const ui: IVaultUIElements = {
    body: $('body'),
    loginFormDialog: $('#login-form-dialog'),
    loginForm: $('#login-form'),
    container: $('#container'),
    controls: $('#controls'),
    modal: $('#modal'),
    modalContent: $('#modal-content'),
    newButton: $('#new'),
    adminButton: $('#admin'),
    clearSearchButton: $('#clear-search'),
    searchInput: $('#search'),
    spinner: $('#spinner')
};

const templates: IVaultUITemplates = {
    urlLink: Handlebars.compile($('#tmpl-urllink').html()),
    urlText: Handlebars.compile($('#tmpl-urltext').html()),
    detail: Handlebars.compile($('#tmpl-detail').html()),
    credentialForm: Handlebars.compile($('#tmpl-credentialform').html()),
    deleteConfirmationDialog: Handlebars.compile($('#tmpl-deleteconfirmationdialog').html()),
    optionsDialog: Handlebars.compile($('#tmpl-optionsdialog').html()),
    exportedDataWindow: Handlebars.compile($('#tmpl-exporteddatawindow').html()),
    credentialTable: Handlebars.compile($('#tmpl-credentialtable').html()),
    credentialTableRow: Handlebars.compile($('#tmpl-credentialtablerow').html()),
    validationMessage: Handlebars.compile($('#tmpl-validationmessage').html()),
    modalHeader: Handlebars.compile($('#tmpl-modalheader').html()),
    modalBody: Handlebars.compile($('#tmpl-modalbody').html()),
    modalFooter: Handlebars.compile($('#tmpl-modalfooter').html()),
    copyLink: Handlebars.compile($('#tmpl-copylink').html())
};

Handlebars.registerPartial('credentialtablerow', templates.credentialTableRow);

Handlebars.registerPartial('copylink', templates.copyLink);

Handlebars.registerHelper('breaklines', (text: string) => {
    const escapedText = Handlebars.Utils.escapeExpression(text);
    return new Handlebars.SafeString(escapedText.replace(/(\r\n|\n|\r)/gm, '<br />'));
});

Handlebars.registerHelper('truncate', (text: string, size: number) => {
    const escapedText = Handlebars.Utils.escapeExpression(truncate(text, size));
    return new Handlebars.SafeString(escapedText);
});

function isWeakPassword(item: ICredential) {
    return item.Password && cryptoProvider.getPasswordBits(item.Password) <= weakPasswordThreshold;
}

function search(query: string, credentials: ICredential[]) {
    const parsedQuery = parseSearchQuery(query);
    return searchCredentials(parsedQuery, isWeakPassword, credentials);
}

export function isChecked(el: JQuery) {
    return (el[0] as HTMLInputElement).checked;
}

export function checkIf(el: JQuery, condition: boolean) {
    (el[0] as HTMLInputElement).checked = condition;
}

export function getPasswordSpecificationFromUI(container: JQuery, predicate: (element: JQuery) => boolean) {
    const len = container.find('[name=len]').val() as number;
    const specification: IPasswordSpecification = {
        length: isNaN(len) ? 16 : len,
        lowercase: predicate(container.find('[name=lcase]')),
        uppercase: predicate(container.find('[name=ucase]')),
        numbers: predicate(container.find('[name=nums]')),
        symbols: predicate(container.find('[name=symb]'))
    };
    return specification;
}

function updatePasswordSpecificationOptionUI(container: JQuery, specification: IPasswordSpecification) {
    container.find('[name=len]').val(specification.length);
    checkIf(container.find('[name=ucase]'), specification.uppercase);
    checkIf(container.find('[name=lcase]'), specification.lowercase);
    checkIf(container.find('[name=nums]'), specification.numbers);
    checkIf(container.find('[name=symb]'), specification.symbols);
}

export function getCredentialFromUI(container: JQuery) {
    const obj: any = {};
    // Serialize the form inputs into an object
    container.find('input:not(.submit, .chrome-autocomplete-fake), textarea').each((i, el) => {
        obj[(el as HTMLInputElement).name] = $(el).val();
    });
    return (obj as ICredential);
}

export function parseImportData(userId: string, masterKey: string, rawData: string) {
    const jsonImportData = JSON.parse(rawData) as ICredential[];
    const excludes = encryptionExcludes;

    const newData = jsonImportData.map(item => {
        // Null out the old credential ID so UpdateMultiple knows this is a new record
        item.CredentialID = null;
        // Set the user ID to the ID of the new (logged in) user
        item.UserID = userId;
        return cryptoProvider.encryptCredential(item, masterKey, excludes);
    });

    return newData;
}

// IMPURE FUNCTIONS BELOW THIS COMMENT

export function updateCredentialListUI(container: JQuery, data: ICredential[], userId: string, masterKey: string) {
    const rows = data.map(c => mapToSummary(masterKey, userId, isWeakPassword, c));
    container.html(templates.credentialTable({ rows: rows }));
}

export async function exportData(userId: string, masterKey: string) {
    const credentials = await repository.loadCredentialsForUserFull(userId);
    return credentials.map(item => cryptoProvider.decryptCredential(item, masterKey, encryptionExcludes));
}

// Change the password and re-encrypt all credentials with the new password
export async function changePassword(userId: string, masterKey: string, oldPassword: string, newPassword: string) {
    const newPasswordHash: string = cryptoProvider.hash(newPassword);
    const newMasterKey: string = cryptoProvider.utf8ToBase64(cryptoProvider.generateMasterKey(newPassword));

    // Get all the user's credentials, decrypt each with the old password and re-encrypt it with the new one
    const credentials = await repository.loadCredentialsForUserFull(userId);

    const reEncrypt = (item: ICredential) => {
        const decrypted = cryptoProvider.decryptCredential(item, masterKey, encryptionExcludes);
        return cryptoProvider.encryptCredential(decrypted, newMasterKey, encryptionExcludes);
    };

    const newData = credentials.map(reEncrypt);

    await repository.updateMultiple(newData);

    await repository.updatePassword(userId, cryptoProvider.hash(oldPassword), newPasswordHash);
}

// Show delete confirmation dialog
function confirmDelete(id: string, masterKey: string) {
    showModal({
        title: 'Delete Credential',
        content: templates.deleteConfirmationDialog({}),
        showDelete: true,
        deleteText: 'Yes, Delete This Credential',
        ondelete: async e => {
            e.preventDefault();

            await repository.deleteCredential(internal.userId, id);

            const updatedCredentials = await repository.loadCredentialsForUser(internal.userId);

            const decrypted = cryptoProvider.decryptCredentials(updatedCredentials, internal.masterKey, encryptionExcludes);

            const results = search(ui.searchInput.val() as string, decrypted);
            updateCredentialListUI(ui.container, results, internal.userId, internal.masterKey);

            ui.modal.modal('hide');
        }
    });
}

function hideModal(e: JQuery.Event) {
    e.preventDefault();
    ui.modal.modal('hide');
}

// Load a record into the edit form
// If null is passed as the credentialId, we set up the form for adding a new record
async function editCredential(credentialId: string, masterKey: string) {
    const encryptedCredential = await repository.loadCredential(credentialId);
    // CredentialID and UserID are not currently encrypted so don't try to decode them
    const credential = cryptoProvider.decryptCredential(encryptedCredential, masterKey, encryptionExcludes);
    showModal({
        title: 'Edit Credential',
        content: templates.credentialForm(credential),
        showAccept: true,
        acceptText: 'Save',
        onaccept: (): void => {
            $('#credential-form').submit();
        }
    });
    ui.modal.find('#Description').focus();
    showPasswordStrength(ui.modal.find('#Password'));

    const savedPasswordSpecification = parsePasswordSpecificationString(credential.PwdOptions);
    const currentPasswordSpecification = getPasswordSpecificationFromPassword(credential.Password);

    // Rather convoluted, but this is why:
    // - If there's a valid password spec stored against the credential, use that
    // - If there isn't a stored spec, work out the spec from the current password and use that
    // - If there isn't a password, use the default specification
    const passwordSpecification = savedPasswordSpecification
        || currentPasswordSpecification
        || defaultPasswordSpecification;

    updatePasswordSpecificationOptionUI(ui.modal, passwordSpecification);
}

export function openExportPopup(data: ICredential[]) {
    const exportWindow = open('', 'EXPORT_WINDOW', 'WIDTH=700, HEIGHT=600');
    if (exportWindow && exportWindow.top) {
        exportWindow.document.write(templates.exportedDataWindow({ json: JSON.stringify(data, undefined, 4) }));
    } else {
        alert('The export feature works by opening a popup window, but our popup window was blocked by your browser.');
    }
}

// Show the options dialog
function optionsDialog() {
    const dialogHtml = templates.optionsDialog({
        userid: internal.userId,
        masterkey: cryptoProvider.utf8ToBase64(internal.masterKey)
    });

    showModal({
        title: 'Admin',
        content: dialogHtml
    });
}

export function reloadApp(baseUrl: string) {
    // Just reload the whole page when we're done to force login
    location.href = baseUrl.length > 1 ? baseUrl.slice(0, -1) : baseUrl;
}

// Show the read-only details modal
async function showDetail(credentialId: string, masterKey: string) {
    const encryptedCredential = await repository.loadCredential(credentialId);

    // CredentialID and UserID are not currently encrypted so don't try to decode them
    const credential = cryptoProvider.decryptCredential(encryptedCredential, masterKey, encryptionExcludes);

    // Slightly convoluted, but basically don't link up the URL if it doesn't contain a protocol
    const urlText = templates.urlText({ Url: credential.Url });
    const urlHtml = credential.Url.indexOf('//') === -1 ? urlText : templates.urlLink({ Url: credential.Url, UrlText: urlText });

    const detailHtml = templates.detail({
        Url: credential.Url,
        UrlHtml: urlHtml,
        Username: credential.Username,
        Password: credential.Password,
        UserDefined1: credential.UserDefined1,
        UserDefined1Label: credential.UserDefined1Label,
        UserDefined2: credential.UserDefined2,
        UserDefined2Label: credential.UserDefined2Label,
        Notes: credential.Notes
    });

    showModal({
        credentialId: credentialId,
        title: credential.Description,
        content: detailHtml,
        showEdit: true,
        showDelete: true,
        onedit: () => editCredential(credentialId, masterKey),
        ondelete: () => confirmDelete(credentialId, masterKey)
    });
}

function showModal(options: IVaultModalOptions) {
    const showAccept: boolean = options.showAccept || false;
    const showClose: boolean = options.showClose || true;
    const showEdit: boolean = options.showEdit || false;
    const showDelete: boolean = options.showDelete || false;
    let html: string = templates.modalHeader({
        title: options.title,
        closeText: options.closeText || 'Close',
        showAccept: showAccept,
        showClose: showClose,
        showEdit: showEdit,
        showDelete: showDelete
    }) + templates.modalBody({
        content: options.content
    });

    if (showAccept || showClose || showEdit || showDelete) {
        html += templates.modalFooter({
            credentialId: options.credentialId,
            acceptText: options.acceptText || 'OK',
            closeText: options.closeText || 'Close',
            editText: options.editText || 'Edit',
            deleteText: options.deleteText || 'Delete',
            showAccept: showAccept,
            showClose: showClose,
            showEdit: showEdit,
            showDelete: showDelete
        });
    }

    ui.modalContent.html(html);
    ui.modal.off('click', 'button.btn-accept');
    ui.modal.off('click', 'button.btn-close');
    ui.modal.off('click', 'button.btn-edit');
    ui.modal.off('click', 'button.btn-delete');
    ui.modal.on('click', 'button.btn-accept', options.onaccept || hideModal);
    ui.modal.on('click', 'button.btn-close', options.onclose || hideModal);
    ui.modal.on('click', 'button.btn-edit', options.onedit || (() => alert('NOT BOUND')));
    ui.modal.on('click', 'button.btn-delete', options.ondelete || (() => alert('NOT BOUND')));
    ui.modal.modal();
}

// Show password strength visually
function showPasswordStrength(field: JQuery) {
    const strengthIndicator = field.next('div.password-strength');
    const status = strengthIndicator.find('> span');
    const bar = strengthIndicator.find('> div');
    const password = field.val() as string;
    const strength = cryptoProvider.getPasswordBits(password);
    bar.removeClass();
    if (strength === 0) {
        status.html('No Password');
        bar.css('width', 0);
    } else if (strength <= 100) {
        bar.css('width', strength + '%');
        if (strength <= 10) {
            bar.addClass('extremely-weak');
            status.html('Extremely Weak (' + strength + ')');
        } else if (strength <= 25) {
            bar.addClass('very-weak');
            status.html('Very Weak (' + strength + ')');
        } else if (strength <= weakPasswordThreshold) {
            bar.addClass('weak');
            status.html('Weak (' + strength + ')');
        } else if (strength <= 55) {
            bar.addClass('average');
            status.html('Average (' + strength + ')');
        } else if (strength <= 75) {
            bar.addClass('strong');
            status.html('Strong (' + strength + ')');
        } else {
            bar.addClass('very-strong');
            status.html('Very Strong (' + strength + ')');
        }
    } else {
        bar.addClass('extremely-strong');
        status.html('Extremely Strong (' + strength + ')');
        bar.css('width', '100%');
    }
}

ui.container.on('click', '.btn-credential-show-detail', e => {
    e.preventDefault();
    const id = $(e.currentTarget).parent().parent().attr('id');
    showDetail(id, internal.masterKey);
});

ui.newButton.on('click', e => {
    e.preventDefault();
    showModal({
        title: 'Add Credential',
        content: templates.credentialForm({ UserID: internal.userId }),
        showAccept: true,
        acceptText: 'Save',
        onaccept: (): void => {
            $('#credential-form').submit();
        }
    });
    ui.modal.find('#Description').focus();
    showPasswordStrength(ui.modal.find('#Password'));
    updatePasswordSpecificationOptionUI(ui.modal, defaultPasswordSpecification);
});

ui.adminButton.on('click', e => {
    e.preventDefault();
    optionsDialog();
});

ui.clearSearchButton.on('click', async e => {
    e.preventDefault();
    const credentials = await repository.loadCredentialsForUser(internal.userId);
    const decrypted = cryptoProvider.decryptCredentials(credentials, internal.masterKey, encryptionExcludes);
    const results = search(null, decrypted);
    updateCredentialListUI(ui.container, results, internal.userId, internal.masterKey);
    ui.searchInput.val('').focus();
});

ui.searchInput.on('keyup', rateLimit(async e => {
    const credentials = await repository.loadCredentialsForUser(internal.userId);
    const decrypted = cryptoProvider.decryptCredentials(credentials, internal.masterKey, encryptionExcludes);
    const results = search((e.currentTarget as HTMLInputElement).value, decrypted);
    updateCredentialListUI(ui.container, results, internal.userId, internal.masterKey);
}, 200));

// Initialise globals and load data on correct login
ui.loginForm.on('submit', async e => {
    e.preventDefault();

    const username = ui.loginForm.find('#UN1209').val() as string;
    const password = ui.loginForm.find('#PW9804').val() as string;

    const loginResult = await repository.login(cryptoProvider.hash(username), cryptoProvider.hash(password));

    // If the details were valid
    if (loginResult.result === 1 && loginResult.id !== '') {
        // Set some private variables so that we can reuse them for encryption during this session
        internal.userId = loginResult.id;
        internal.password = password;
        internal.masterKey = cryptoProvider.utf8ToBase64(cryptoProvider.generateMasterKey(internal.password));

        await repository.loadCredentialsForUser(internal.userId);
        // Successfully logged in. Hide the login form
        ui.loginForm.hide();
        ui.loginFormDialog.modal('hide');
        ui.controls.show();
        ui.searchInput.focus();
    }
});

// Save the new details on edit form submit
ui.body.on('submit', '#credential-form', async e => {
    e.preventDefault();

    const form = $(e.currentTarget);
    const errorMsg: string[] = [];

    $('#validation-message').remove();
    form.find('div.has-error').removeClass('has-error');

    const credential = getCredentialFromUI(form);

    const errors = validateCredential(credential);

    if (errors.length > 0) {
        errors.forEach(err => {
            errorMsg.push(err.errorMessage);
            $(`${err.property}`).parent().parent().addClass('has-error');
        });

        ui.modal.find('div.modal-body').prepend(templates.validationMessage({ errors: errorMsg.join('<br />') }));
        return;
    }

    // CredentialID and UserID are not currently encrypted so don't try to decode them
    const encryptedCredential = cryptoProvider.encryptCredential(credential, internal.masterKey, encryptionExcludes);

    await repository.updateCredential(encryptedCredential);

    const updatedCredentials = await repository.loadCredentialsForUser(internal.userId);

    const decrypted = cryptoProvider.decryptCredentials(updatedCredentials, internal.masterKey, encryptionExcludes);
    const results = search(ui.searchInput.val() as string, decrypted);

    ui.modal.modal('hide');

    updateCredentialListUI(ui.container, results, internal.userId, internal.masterKey);

    return;
});

// Show password strength as it is typed
ui.body.on('keyup', '#Password', rateLimit(e => {
    showPasswordStrength($(e.currentTarget));
}, 200));

// Generate a nice strong password
ui.body.on('click', 'button.generate-password', e => {
    e.preventDefault();
    const passwordSpecification = getPasswordSpecificationFromUI(ui.modal, isChecked);
    const password = cryptoProvider.generatePassword(passwordSpecification);
    $('#Password').val(password);
    const opts = [$('#len').val() as number,
    isChecked($('#ucase')) ? 1 : 0,
    isChecked($('#lcase')) ? 1 : 0,
    isChecked($('#nums')) ? 1 : 0,
    isChecked($('#symb')) ? 1 : 0];
    $('#PwdOptions').val(opts.join('|'));
    showPasswordStrength($('#Password'));
});

// Toggle password generation option UI visibility
ui.body.on('click', 'a.generate-password-options-toggle', e => {
    e.preventDefault();
    $('div.generate-password-options').toggle();
});

// Copy content to clipboard when copy icon is clicked
ui.body.on('click', 'a.copy-link', e => {
    e.preventDefault();
    const a = $(e.currentTarget);
    $('a.copy-link').find('span').removeClass('copied').addClass('fa-clone').removeClass('fa-check-square');
    a.next('input.copy-content').select();
    try {
        if (document.execCommand('copy')) {
            a.find('span').addClass('copied').removeClass('fa-clone').addClass('fa-check-square');
        }
    } catch (ex) {
        alert('Copy operation is not supported by the current browser: ' + ex.message);
    }
});

ui.body.on('click', 'button.btn-credential-open', e => {
    e.preventDefault();
    open($(e.currentTarget).data('url'));
});

ui.body.on('click', 'button.btn-credential-copy', e => {
    e.preventDefault();
    const allButtons = $('button.btn-credential-copy');
    const button = $(e.currentTarget);
    allButtons.removeClass('btn-success').addClass('btn-primary');
    allButtons.find('span').addClass('fa-clone').removeClass('fa-check-square');
    button.next('input.copy-content').select();
    try {
        if (document.execCommand('copy')) {
            button.addClass('btn-success').removeClass('btn-primary');
            button.find('span').removeClass('fa-clone').addClass('fa-check-square');
        }
    } catch (ex) {
        alert('Copy operation is not supported by the current browser: ' + ex.message);
    }
});

// Automatically focus the search field if a key is pressed from the credential list
ui.body.on('keydown', e => {
    const eventTarget = e.target as HTMLElement;
    if (eventTarget.nodeName === 'BODY') {
        e.preventDefault();
        // Cancel the first mouseup event which will be fired after focus
        ui.searchInput.one('mouseup', me => {
            me.preventDefault();
        });
        ui.searchInput.focus();
        const char = String.fromCharCode(e.keyCode);
        if (/[a-zA-Z0-9]/.test(char)) {
            ui.searchInput.val(e.shiftKey ? char : char.toLowerCase());
        } else {
            ui.searchInput.select();
        }
    }
});

ui.body.on('click', '#change-password-button', e => {
    const newPassword = $('#NewPassword').val() as string;
    const newPasswordConfirm = $('#NewPasswordConfirm').val() as string;

    const confirmationMsg = 'When the password change is complete you will be logged out and will need to log back in.\n\n'
        + 'Are you SURE you want to change the master password?';

    if (newPassword === '') {
        alert('Password cannot be left blank.');
        return;
    }

    if (newPassword !== newPasswordConfirm) {
        alert('Password confirmation does not match password.');
        return;
    }

    if (!confirm(confirmationMsg)) {
        return;
    }

    changePassword(internal.userId, internal.masterKey, internal.password, newPassword).then(() => {
        // Just reload the whole page when we're done to force login
        location.href = internal.basePath.length > 1 ? internal.basePath.slice(0, -1) : internal.basePath;
    });
});

ui.body.on('click', '#export-button', async e => {
    e.preventDefault();
    const exportedData = await exportData(internal.userId, internal.masterKey);
    openExportPopup(exportedData);
});

ui.body.on('click', '#import-button', async e => {
    e.preventDefault();
    const rawData = $('#import-data').val() as string;
    const parsedData = parseImportData(internal.userId, internal.masterKey, rawData);
    await repository.updateMultiple(parsedData);
    reloadApp(_VAULT_GLOBALS.baseUrl);
});

// If we're in dev mode, automatically log in with a cookie manually created on the dev machine
if (_VAULT_GLOBALS.devMode) {
    ui.loginForm.find('#UN1209').val(Cookies.get('vault-dev-username'));
    ui.loginForm.find('#PW9804').val(Cookies.get('vault-dev-password'));
    ui.loginForm.submit();
} else {
    ui.loginForm.find('#UN1209').focus();
}

ui.loginFormDialog.modal({ keyboard: false, backdrop: 'static' });
