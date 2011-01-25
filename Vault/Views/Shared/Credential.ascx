﻿<%@ Control Language="C#" Inherits="System.Web.Mvc.ViewUserControl<Vault.Models.CredentialViewModel>" %>

<div id="credential-form-dialog">

<% using(Html.BeginForm("Update", "Main", FormMethod.Post, new { id = "credential-form" })) { %>

<p><%= Html.LabelFor(x => x.Description) %> 
<%= Html.TextBoxFor(x => x.Description)%></p>

<p><%= Html.LabelFor(x => x.Username) %> 
<%= Html.TextBoxFor(x => x.Username)%></p>

<p><%= Html.LabelFor(x => x.Password) %> 
<%= Html.TextBoxFor(x => x.Password)%></p>

<p><%= Html.LabelFor(x => x.Url) %> 
<%= Html.TextBoxFor(x => x.Url)%></p>

<p><%= Html.LabelFor(x => x.UserDefined1Label) %> 
<%= Html.TextBoxFor(x => x.UserDefined1Label)%></p>

<p><%= Html.LabelFor(x => x.UserDefined1) %> 
<%= Html.TextBoxFor(x => x.UserDefined1)%></p>

<p><%= Html.LabelFor(x => x.UserDefined2Label) %> 
<%= Html.TextBoxFor(x => x.UserDefined2Label)%></p>

<p><%= Html.LabelFor(x => x.UserDefined2) %> 
<%= Html.TextBoxFor(x => x.UserDefined2)%></p>

<p><%= Html.LabelFor(x => x.Notes) %> 
<%= Html.TextAreaFor(x => x.Notes)%></p>

<p>
<%= Html.HiddenFor(x => x.CredentialID) %>
<%= Html.HiddenFor(x => x.UserID) %>
<input class="submit" type="submit" value="Save" /></p>

<% } %>

</div>