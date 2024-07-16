using System;
using System.Collections.Generic;
using System.Data.Entity;
using System.Linq;
using System.Net;
using System.Web.Mvc;
using VideoChat.Models;

namespace VideoChat.Controllers
{
    public class HomeController : Controller
    {
        private ApplicationDbContext db = new ApplicationDbContext();
        public ActionResult Index(string username,string type)
        {
            username = "Ujjwal";
            type = "Teacher";
            return View();
        }
        public ActionResult UserData()
        {
            try
            {
                var user = db.Contactus.ToList();
                return RedirectToAction("Index");
            }
            catch (Exception ex)
            {
                // Log the exception
                Console.WriteLine(ex.Message);
                return View("Error");
            }
        }
    }
}
