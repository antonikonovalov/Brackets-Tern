/*
 * Copyright (c) 2013 Miguel Castillo.
 *
 * Licensed under MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

define(function (require, exports, module) {
    'use strict';

    var FileUtils        = brackets.getModule("file/FileUtils"),
        NativeFileSystem = brackets.getModule("file/NativeFileSystem").NativeFileSystem;

    var ProjectFiles = require("ProjectFiles"),
        Timer        = require("Timer");

    var fileLoader = (function(){
        var inProgress= {};
        var httpCache = {};

        // Load up the file from a remote location via http
        function loadFromHTTP(fileName) {
            if (httpCache[fileName]){
                return $.Deferred().resolve(httpCache[fileName]);
            }

            inProgress[fileName] = $.ajax({
                    "url": fileName,
                    "contentType": "text"
                });


            inProgress[fileName].then(function(data) {
                    httpCache[fileName] = {
                        fileName: fileName,
                        fullPath: fileName,
                        text: data
                    };

                    return httpCache[fileName];
                })
                .always(function(){
                    delete inProgress[fileName];
                });

            return inProgress[fileName];
        }


        // Load up the file from a local directory
        function loadFromDirectory(fileName, rootFile) {
            var deferred = $.Deferred();
            var directoryPath = loadFromDirectory.resolvePath(rootFile);

            // Get the directory path handler first, and then try to write to the file
            var directoryEntry = new NativeFileSystem.DirectoryEntry(directoryPath);

            directoryEntry.getFile( fileName, {
                    create: false,
                    exclusice: true
                },
                function( fileEntry ){
                    inProgress[fileName] = FileUtils.readAsText(fileEntry);

                    inProgress[fileName].done(function(text){
                            var data = {
                                fileName: fileName,
                                fullPath: directoryPath + fileName,
                                text: text
                            };

                            deferred.resolve(data);
                        })
                        .fail(function(error){
                            deferred.reject(error);
                        })
                        .always(function(){
                            delete inProgress[fileName];
                        });

                }, function(ex){
                    deferred.reject(ex);
                });

            return deferred;
        }

        loadFromDirectory.resolvePath = function(rootFile){
            var directoryPath = rootFile.substr(0, rootFile.lastIndexOf("/"));
            return FileUtils.canonicalizeFolderPath(directoryPath) + "/";
        };


        loadFromDirectory.resolveName = function(rootFile, fileName) {
            return loadFromDirectory.resolvePath(rootFile) + fileName;
        };


        // Load up the file from the directory of the current project
        function loadFromProject(fileName) {
            var deferred = $.Deferred();

            function openFileSuccess(fileReader) {
                // Read the content of the file
                inProgress[fileName] = fileReader.readAsText();

                inProgress[fileName].done(function(text){
                    deferred.resolve({
                        fileName: fileName,
                        fullPath: ProjectFiles.resolveName(fileName),
                        text: text
                    });
                })
                .fail(function(error){
                    deferred.reject(error);
                })
                .always(function() {
                    delete inProgress[fileName];
                });
            }

            function openFileFailure(error) {
                return deferred.reject(error);
            }

            // Get a file reader
            ProjectFiles.openFile(fileName).then(openFileSuccess, openFileFailure);
            return deferred;
        }


        // Interface to load the file...
        function loadFile(fileName, rootFile) {
            if (fileName in inProgress) {
                return inProgress[fileName];
            }

            var timer = new Timer(true);
            var deferred;

            if (/^https?:\/\//.test(fileName)) {
                deferred = loadFromHTTP(fileName);
            }
            else {
                deferred = $.Deferred();

                //
                // First try to load the file from the specified rootFile directoty
                // and if that does not work, then we will try to open it from the
                // project directory.  Sometime both directories will be the same...
                //
                loadFromDirectory(fileName, rootFile).done(function(data) {
                        //console.log("Loaded from directory", fileName, data);
                        deferred.resolve(data);
                    }).fail(function( ) {

                        loadFromProject(fileName).done(function(data) {
                                //console.log("Loaded from project", fileName, data);
                                deferred.resolve(data);
                            }).fail(function(error){
                                //console.log("File not loaded.", fileName, error);
                                deferred.reject(error);
                            });

                    });
            }

            return deferred.done(function(data) {
                //console.log("File loaded", fileName, timer.elapsed());
            }).fail(function(error){
                //console.log("File not loaded.", fileName, error, timer.elapsed());
            });
        }


        return {
            loadFile: loadFile
        };

    })();


    return fileLoader;
});

