﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;
using Vault.Models;
using System.Data.SQLite;
using System.Configuration;
using System.Data;
using Dapper;

namespace Vault.Controllers
{
    public class MainController : Controller
    {
        string _connString;

        public MainController()
        {
            _connString = ConfigurationManager.ConnectionStrings["Vault"].ConnectionString;
        }

        public ActionResult Index()
        {
            return View();
        }

        public ActionResult Generate()
        {
            return View();
        }

        [HttpPost]
        public ActionResult GetAll(string userId)
        {
            IEnumerable<CredentialListViewModel> credentials;

            using (var conn = new SQLiteConnection(_connString))
            {
                conn.Open();
                credentials = conn.Query<CredentialListViewModel>("select CredentialID, UserID, Description from tCredential where UserID = @UserID", new { UserID = userId });
            }

            return Json(credentials);
        }

        [HttpPost]
        public ActionResult GetAllComplete(string userId)
        {
            IEnumerable<CredentialListViewModel> credentials;

            using (var conn = new SQLiteConnection(_connString))
            {
                conn.Open();
                credentials = conn.Query<CredentialListViewModel>("select * from tCredential where UserID = @UserID", new { UserID = userId });
            }

            return Json(credentials);
        }

        [HttpPost]
        public ActionResult Load(string id)
        {
            CredentialViewModel credential;

            using (var conn = new SQLiteConnection(_connString))
            {
                conn.Open();
                credential = conn.Query<CredentialViewModel>("select * from tCredential where CredentialID = @CredentialID", new { CredentialID = id }).FirstOrDefault();
            }

            // Fix for previous behaviour
            if (credential != null)
                credential.PasswordConfirmation = credential.Password;

            return Json(credential);
        }

        [HttpPost]
        public ActionResult Delete(string credentialId, string userId)
        {
            var success = true;

            using (var conn = new SQLiteConnection(_connString))
            {
                conn.Open();
                conn.Execute("delete from tcredential where UserID = @UserID and CredentialID = @CredentialID", new { UserID = userId, CredentialID = credentialId });
            }

            return Json(new { Success = success });
        }

        [HttpPost]
        public ActionResult UpdateMultiple(IList<CredentialViewModel> model)
        {
            foreach(var item in model)
                UpdateCredential(item);

            return Json(new { Updated = model.Count });
        }

        [HttpPost]
        public ActionResult Update(CredentialViewModel model)
        {
            var updated = UpdateCredential(model);

            return Json(new { CredentialID = updated.CredentialID });
        }

        private CredentialViewModel UpdateCredential(CredentialViewModel model)
        {
            var sql = "insert into tcredential (CredentialID, Description, Username, Password, Url, UserDefined1Label, UserDefined1, UserDefined2Label, UserDefined2, Notes, UserID) values " +
                      "(@CredentialID, @Description, @Username, @Password, @Url, @UserDefined1Label, @UserDefined1, @UserDefined2Label, @UserDefined2, @Notes, @UserID); select @CredentialID as id;";

            if (model.CredentialID != null)
            {
                sql = "update tcredential set Description = @Description, Username = @Username, Password = @Password, Url = @Url, UserDefined1Label = @UserDefined1Label, " +
                      "UserDefined1 = @UserDefined1, UserDefined2Label = @UserDefined2Label, UserDefined2 = @UserDefined2, Notes = @Notes, UserID = @UserID where credentialid = @CredentialID; select @CredentialID as id;";
            }

            if (model.CredentialID == null)
                model.CredentialID = Guid.NewGuid().ToString();

            using (var conn = new SQLiteConnection(_connString))
            {
                conn.Open();
                conn.Execute(sql, model);
            }

            return model;
        }

        [HttpPost]
        public ActionResult UpdatePassword(string userId, string oldHash, string newHash)
        {
            using (var conn = new SQLiteConnection(_connString))
            {
                conn.Open();
                conn.Execute("update tUser set Password = @NewHash where UserID = @UserID and Password = @OldHash", new { UserID = userId, OldHash = oldHash, NewHash = newHash });
            }

            return Json(new { success = true });
        }

        [HttpPost]
        public ActionResult Login(LoginViewModel model)
        {
            var userId = "";

            using (var conn = new SQLiteConnection(_connString))
            {
                conn.Open();
                userId = conn.Query<string>("select * from tUser where Username = @Username and Password = @Password", new { Username = model.Username, Password = model.Password }).FirstOrDefault();
            }

            return Json(new { result = ((!string.IsNullOrEmpty(userId)) ? 1 : 0), id = userId });
        }
    }
}
