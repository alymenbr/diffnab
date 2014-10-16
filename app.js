var express = require('express'); //Express Web Server 
var busboy = require('connect-busboy'); //middleware for form/file upload
var path = require('path'); //used for file path
var fs = require('fs-extra'); //File System - for file manipulation
var parse = require('csv-parse');

var app = express();
app.use(busboy());
app.use(express.static(path.join(__dirname, 'public')));


var ynabFileName = null;
var bankFileName = null;
/* ========================================================== 
Create a Route (/upload) to handle the Form submission 
(handle POST requests to /upload)
Express v4  Route definition
============================================================ */
app.route('/upload').post(function(req, res, next) {

    var filesCount = 0;
    var fstream;
    req.pipe(req.busboy);
    req.busboy.on('file', function(fieldname, file, filename) {
        console.log("Uploading " + fieldname + ": " + filename);

        if (fieldname == 'ynabFile')
            ynabFileName = filename;

        if (fieldname == 'bankFile')
            bankFileName = filename;

        //Path where image will be uploaded
        fstream = fs.createWriteStream(__dirname + '/uploads/' + filename);
        file.pipe(fstream);
        fstream.on('close', function() {
            console.log("Upload Finished of " + filename);

            filesCount++;
            if (filesCount == 2)
                res.redirect('/doYourThing'); //where to go next
        });
    });
});


/// Show files
app.get('/doYourThing', function(req, res) {
    var ynabContent = fs.readFileSync(__dirname + "/uploads/" + ynabFileName);
    var bankContent = fs.readFileSync(__dirname + "/uploads/" + bankFileName);

    var resultContent = doYourThing(ynabContent, bankContent);

    // RESPONSE
    res.writeHead(200, {
        'Content-Type': 'text/csv'
    });
    res.end(resultContent, 'binary');

});



var server = app.listen(8080, function() {
    console.log('Listening on port %d', server.address().port);
});


function doYourThing(ynabContent, bankContent) {
    var ynab;
    var bank;

    parse(ynabContent.toString(), {
        delimiter: '\t'
    }, function(err, output) {
        ynab = output.slice(0);
    });

    parse(bankContent.toString(), {
        delimiter: ','
    }, function(err, output) {
        bank = output.slice(0);
    });

    console.log('--------------');
    console.log('ynabContent');
    console.log(ynab);

    console.log('--------------');
    console.log('bankContent');
    console.log(bank);








    /*
    var file = '/tmp/this/path/does/not/exist/file.txt'

fs.outputFile(file, 'hello!', function(err) {
  console.log(err); //null

  fs.readFile(file, 'utf8', function(err, data) {
    console.log(data); //hello!
  })
})
    */


    return 'AEEEE';
}