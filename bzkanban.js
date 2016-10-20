var bzSiteUrl = "http://bugzilla.msec.local";
var bzProduct = "";
var bzProductMilestone = "";
var bzComponent = "";
var bzPriority = "";
var bzAssignedTo = "";
var bzOrder = "priority,bug_severity,assigned_to";
var bzUserFullName = "";
var bzShowGravatar = true;
var bzProductHasUnconfirmed = false;
var bzBoardLoadTime = "";
var bzRestGetBugsUrl = "";
var bzAllowUserLogin = true;
var bzCheckForUpdates = true;
var bzAddCommentOnChange = true;
var bzLoadComments = false;
var bzAutoComment = false;
var bzAutoRefresh = false;
var bzAssignees = new Map();
var bzProductComponents;
var bzProductVersions;
var bzDefaultPriority;
var bzDefaultSeverity;
var bzDefaultMilestone;
var bzAuthObject;

window.onload = loadParams;

function loadParams() {
    bzProduct = getURLParameter('product');
    bzProductMilestone = getURLParameter('milestone');

    var assignee = getURLParameter('assignee');
    if (assignee !== null) {
        bzAssignedTo = assignee;
    }

    // Allow the Bugzilla site URL to be overriden. Useful for testing.
    // For most permanent deployments just change the hardcodecoded bzSiteUrl.
    var site = getURLParameter('site');
    if (site !== null) {
        bzSiteUrl = site;
    }

    // Loading comments is expensive becase it's one extra request per bug.
    // Causing some Bugzilla servers to respond with "too many requests" errors.
    var comments = getURLParameter('comments');
    if (comments !== null) {
        bzLoadComments = isTrue(comments);
    }

    var autocomment = getURLParameter('autocomment');
    if (autocomment !== null) {
        bzAutoComment = isTrue(autocomment);
    }

    var pictures = getURLParameter('gravatar');
    if (pictures !== null) {
        bzShowGravatar = isTrue(pictures);
    }

    var autorefresh = getURLParameter('autorefresh');
    if (autorefresh !== null) {
        bzAutoRefresh = isTrue(autorefresh);
    }

    initNav();
    initBoard();

    if (bzAllowUserLogin) {
        bzAuthObject = JSON.parse(localStorage.getItem(bzSiteUrl));

        if (isLoggedIn()) {
            loadName();
            hideSignInButton();
        }
    } else {
        hideSignInButton();
    }

    loadProductsList();
    loadProductInfo();
    loadColumns();

    if (bzProduct !== null) {
        loadMilestonesList();
    }

    if (bzProduct !== null && bzProductMilestone !== null) {
        loadBoard();
    }
}

function initNav() {
    var nav = document.createElement("div");
    nav.id = "nav";
    document.querySelector("body").appendChild(nav);

    initQueryFields();
    initBacklogTarget();

    var spring = document.createElement("span");
    spring.className = "spring";
    nav.appendChild(spring);

    initSpinner();
    initActions();
    initLoginForm();
}

function initBoard() {
    var board = document.createElement("div");
    board.id = "board";
    document.querySelector("body").appendChild(board);
}

function initQueryFields() {
    var query = document.createElement("span");
    query.id = "query";

    var product = document.createElement("span");

    var productIcon = document.createElement("i");
    productIcon.className = "fa fa-archive";

    var productList = document.createElement("select");
    productList.id = "textProduct";
    productList.name = "product";
    productList.disabled = "true"; // until content is loaded

    // When the user changes the Product drop down
    productList.addEventListener("input", function() {
        bzProduct = document.getElementById('textProduct').value;

        // Disable Milestones until it's refreshed
        document.getElementById("textMilestone").disabled = true;

        // Clear affected state.
        bzProductMilestone = "";
        bzAssignedTo = "";
        loadMilestonesList();
        loadProductInfo();
        clearAssigneesList();
        clearCards();
        updateAddressBar();
    });

    var milestone = document.createElement("span");

    var milestoneIcon = document.createElement("i");
    milestoneIcon.className = "fa fa-flag";

    var milestoneList = document.createElement("select");
    milestoneList.id = "textMilestone";
    milestoneList.name = "milestone";
    milestoneList.disabled = "true"; // until content is loaded

    // When the user changes the Milestone drop down
    milestoneList.addEventListener("input", function() {
        bzProductMilestone = document.getElementById('textMilestone').value;

        // Clear affected state.
        bzAssignedTo = "";
        clearAssigneesList();

        // Hot load the board without a form submit.
        loadBoard();
        updateAddressBar();
    });

    var assignee = document.createElement("span");

    var assigneeIcon = document.createElement("i");
    assigneeIcon.className = "fa fa-user";

    var assigneeList = document.createElement("select");
    assigneeList.id = "textAssignee";
    assigneeList.name = "assignee";
    assigneeList.disabled = "true"; // until content is loaded

    // When the user changes the Assignee drop down
    assigneeList.addEventListener("input", function() {
        bzAssignedTo = document.getElementById('textAssignee').value;
        updateAddressBar();
        var name = bzAssignees.get(bzAssignedTo).real_name;
        filterByAssignee(name);
    });

    product.appendChild(productIcon);
    product.appendChild(productList);
    milestone.appendChild(milestoneIcon);
    milestone.appendChild(milestoneList);
    assignee.appendChild(assigneeIcon);
    assignee.appendChild(assigneeList);

    query.appendChild(product);
    query.appendChild(milestone);
    query.appendChild(assignee);

    document.querySelector("#nav").appendChild(query);
}

function initBacklogTarget() {
    var backlog = document.createElement("div");
    backlog.id = "textBacklog";
    backlog.className = "drop-target";
    backlog.innerText = "Backlog";
    backlog.addEventListener('drag', dragCardStart);
    backlog.addEventListener('dragend', dragCardEnd);
    backlog.addEventListener('dragover', dragCardOver);
    backlog.addEventListener('drop', dropBacklog);
    backlog.addEventListener('dragenter', dragCardEnter);
    backlog.addEventListener('dragleave', dragCardLeave);

    document.querySelector("#nav").appendChild(backlog);
}

function initSpinner() {
    var spinner = document.createElement("span");
    spinner.id = "spinner";

    var icon = document.createElement("i");
    icon.className = "fa fa-cog fa-spin";

    spinner.appendChild(icon);

    document.querySelector("#nav").appendChild(spinner);
}

function initActions() {
    var actions = document.createElement("span");
    actions.id = "actions";

    var newbug = document.createElement("button");
    newbug.id = "bntCreate";
    newbug.innerText = "New Bug";
    newbug.addEventListener("click", function() {
        if (isLoggedIn()) {
            showNewBugModal();
        } else {
            // Open Bugzilla page
            window.open(bzSiteUrl + "/enter_bug.cgi?product=" + bzProduct);
        }
    });

    var whoami = document.createElement("span");
    whoami.id = "whoami";

    var login = document.createElement("button");
    login.id = "btnSignIn";
    login.innerText = "Login";
    login.addEventListener("click", function() {
        showLoginForm();
    });

    var bell = document.createElement("i");
    bell.id = "notification";
    bell.className = "fa fa-bell";

    actions.appendChild(newbug);
    actions.appendChild(whoami);
    actions.appendChild(login);
    actions.appendChild(bell);

    document.querySelector("#nav").appendChild(actions);
}

function initLoginForm() {
    var loginForm = document.createElement("form");
    loginForm.id = "loginForm";

    var usernameLabel = document.createElement("label");
    usernameLabel.innerText = "Username";

    var username = document.createElement("input");
    username.id="textUsername";
    username.type = "text";
    username.required = true;

    usernameLabel.appendChild(username);

    var passwordLabel = document.createElement("label");
    passwordLabel.innerText = "Password";

    var password = document.createElement("input");
    password.id="textPassword";
    password.type = "password";
    password.required = true;

    // When the user presses enter, in the Login password form
    password.addEventListener("keyup", function(event) {
        event.preventDefault();
        if (event.keyCode == 13) {
            document.getElementById("btnAuthSubmit").click();
        }
    });

    passwordLabel.appendChild(password);

    var submit = document.createElement("input");
    submit.id = "btnAuthSubmit";
    submit.value = "Submit";
    submit.type = "button";

    // When the user presses the login Submit button
    submit.addEventListener("click", function() {
        var user = document.getElementById("textUsername").value;
        var password = document.getElementById("textPassword").value;
        doAuth(user, password);
    });

    loginForm.appendChild(usernameLabel);
    loginForm.appendChild(passwordLabel);
    loginForm.appendChild(submit);

    document.querySelector("#nav").appendChild(loginForm);
}


function loadBoard() {
    showSpinner();
    clearCards();
    loadBugs();
}

function loadBugs() {
    bzBoardLoadTime = new Date().toISOString();

    bzRestGetBugsUrl = "/rest/bug?product=" + bzProduct;
    bzRestGetBugsUrl += "&include_fields=summary,status,id,severity,priority,assigned_to,last_updated,deadline";
    bzRestGetBugsUrl += "&order=" + bzOrder;
    bzRestGetBugsUrl += "&target_milestone=" + bzProductMilestone;
    bzRestGetBugsUrl += "&component=" + bzComponent;
    bzRestGetBugsUrl += "&priority=" + bzPriority;

    httpGet(bzRestGetBugsUrl, function(response) {
        var bugs = response.bugs;

        bugs.forEach(function(bug) {
            addCard(bug);
        });

        showColumnCounts();
        loadAssigneesList();
        if (bzAssignedTo != "") {
            var name = bzAssignees.get(bzAssignedTo).real_name;
            filterByAssignee(name);
        }
        hideSpinner();
        scheduleCheckForUpdates();
    });
}

function loadProductsList() {
    httpGet("/rest/product?type=enterable&include_fields=name", function(response) {
        document.getElementById("textProduct").disabled = false;
        var products = response.products;
        products.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });
        products.forEach(function(product) {
            var option = document.createElement('option');
            option.value = product.name;
            option.text = product.name;
            document.getElementById("textProduct").appendChild(option);
        });
        // select it in list.
        document.getElementById("textProduct").value = bzProduct;
    });
}

function loadMilestonesList() {
    clearMilestonesList();
    httpGet("/rest/product?names=" + bzProduct + "&include_fields=milestones", function(response) {
        document.getElementById("textMilestone").disabled = false;
        var milestones = response.products[0].milestones;
        milestones.forEach(function(milestone) {
            var option = document.createElement('option');
            option.value = milestone.name;
            option.text = milestone.name;
            document.getElementById("textMilestone").appendChild(option);
        });
        // select it in list.
        document.getElementById("textMilestone").value = bzProductMilestone;
    });
}

function loadAssigneesList() {
    // HACK add phony user so that we can show all users
    bzAssignees.set( "", { real_name: "ALL", email: "" });

    var sorted = Array.from(bzAssignees.values()).sort(function(a, b) {
        return a.real_name.localeCompare(b.real_name);
    });

    var elem = document.getElementById("textAssignee");

    sorted.forEach(function(assignee) {
        var option = document.createElement('option');
        option.value = assignee.email;
        option.text = assignee.real_name;
        elem.appendChild(option);
    });
    // select it in list.
    document.getElementById("textAssignee").value = bzAssignedTo;

    elem.removeAttribute("disabled");
}

function loadProductInfo() {
    if (bzProduct !== null) {
        httpGet("/rest/product/" + bzProduct + "?include_fields=has_unconfirmed", function(response) {
            bzProductHasUnconfirmed = response.products[0].has_unconfirmed;
            updateUnconfirmedColumnVisibilty();
        });
    }

    // used for populating New Bug modal
    if (isLoggedIn()) {
        loadDefaultMilestone();
        loadComponentsList();
        loadVersionsList();
    }
}

function loadColumns() {
    httpGet("/rest/field/bug/status/values", function(response) {
        var statuses = response.values;
        statuses.forEach(function(status) {
            addBoardColumn(status);
        });
        updateUnconfirmedColumnVisibilty();

        if (isLoggedIn()) {
            loadResolutions();
            loadPriorities();
            loadSeverities();
            loadDefaultPrioritySeverityFields();
        }
    });
}

function loadComments(bug) {
    httpGet("/rest/bug/" + bug.id + "/comment?include_fields=id", function(response) {
        var card = getCardElement(bug.id);
        var commentCount = response.bugs[bug.id].comments.length - 1;
        if (commentCount > 1) {
            var commentElement = card.children.cardmeta.children.icons.children.comment;
            commentElement.style.display = null; // unhide it

            var icon = document.createElement('i');
            icon.setAttribute("class", "fa fa-comment-o fa-sm");
            icon.style.marginRight = "4px";

            commentElement.appendChild(icon);
            commentElement.appendChild(document.createTextNode(commentCount));
        }
    });
}

function loadName() {
    httpGet("/rest/user/" + bzAuthObject.userID + "?token=" + bzAuthObject.userToken, function(response) {
        bzUserFullName = response.users[0].real_name;
        if (bzUserFullName !== null) {
            document.getElementById("whoami").textContent = bzUserFullName;
        }
    });
}

function loadResolutions() {
    httpGet("/rest/field/bug/resolution", function(response) {
        var arrayResolutions = response.fields;

        var resolutions = document.createElement("div");
        resolutions.className = "resolutions";
        resolutions.hidden = true;

        var labelbox = document.createElement("div");
        labelbox.className = "resolution";
        labelbox.innerText += arrayResolutions[0].display_name;
        labelbox.id = "title";
        resolutions.appendChild(labelbox);

        arrayResolutions[0].values.forEach(function(resolution) {
            var resolutionName = resolution.name;
            if (resolutionName !== "") {
                var box = document.createElement("div");
                box.className = "resolution drop-target";
                box.innerText += resolutionName;
                box.id = resolutionName;
                resolutions.appendChild(box);
            }
        });

        // FIXME: this assumes the column name, but it may have been renamed by the bz instance.
        document.getElementById("RESOLVED").appendChild(resolutions);
    });
}

function loadPriorities() {
    httpGet("/rest/field/bug/priority", function(response) {
        // FIXME: this assumes the column name, but it may have been renamed by the bz instance.
        var columns = ["CONFIRMED", "IN_PROGRESS"];

        columns.forEach(function(column) {
            var arrayPriorities = response.fields;

            priorities = document.getElementById(column).getElementsByClassName("priorities")[0];

            var labelbox = document.createElement("div");
            labelbox.className = "priority";
            labelbox.innerText += arrayPriorities[0].display_name;
            labelbox.id = "title";
            priorities.appendChild(labelbox);

            arrayPriorities[0].values.forEach(function(priority) {
                var priorityName = priority.name;
                if (priorityName !== "") {
                    var box = document.createElement("div");
                    box.className = "priority drop-target";
                    box.innerText += priorityName;
                    box.id = priorityName;
                    priorities.appendChild(box);
                }
            });
        });
    });
}

function loadSeverities() {
    httpGet("/rest/field/bug/bug_severity", function(response) {
        // FIXME: this assumes the column name, but it may have been renamed by the bz instance.
        var columns = ["CONFIRMED", "IN_PROGRESS"];

        columns.forEach(function(column) {
            var arraySeverities = response.fields;

            severities = document.getElementById(column).getElementsByClassName("severities")[0];

            var labelbox = document.createElement("div");
            labelbox.className = "severity";
            labelbox.innerText += arraySeverities[0].display_name;
            labelbox.id = "title";
            severities.appendChild(labelbox);

            arraySeverities[0].values.forEach(function(severity) {
                var severityName = severity.name;
                if (severityName !== "") {
                    var box = document.createElement("div");
                    box.className = "severity drop-target";
                    box.innerText += severityName;
                    box.id = severityName;
                    severities.appendChild(box);
                }
            });
        });
    });
}

function loadComponentsList() {
    bzProductComponents = new Set();
    httpGet("/rest/product/" + bzProduct + "?type=enterable&include_fields=components", function(response) {
        var components = response.products[0].components;
        components.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });
        components.forEach(function(component) {
            if (!component.is_active) {
                return;
            }
            bzProductComponents.add(component.name);
        });
    });
}

function loadVersionsList() {
    bzProductVersions = new Set();
    httpGet("/rest/product/" + bzProduct + "?type=enterable&include_fields=versions", function(response) {
        var versions = response.products[0].versions;
        versions.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });
        versions.forEach(function(version) {
            if (!version.is_active) {
                return;
            }
            bzProductVersions.add(version.name);
        });
    });
}

function loadCheckForUpdates() {
    if (bzBoardLoadTime === "") {
        bzCheckForUpdates = false;
        return;
    }
    httpGet(bzRestGetBugsUrl + "&last_change_time=" + bzBoardLoadTime, function(response) {
        if (response.bugs.length > 0) {
            if (bzAutoRefresh) {
                loadBoard();
            } else {
                var bell = document.getElementById("notification");
                bell.style.display = "inline";
                bell.title = response.bugs.length + " bug(s) have been updated externally. Hit refresh!";
            }
        }

        if (bzCheckForUpdates) {
            // Repeat.
            scheduleCheckForUpdates();
        }
    });
}

function loadDefaultPrioritySeverityFields() {
    httpGet("/rest/parameters?token=" + bzAuthObject.userToken, function(response) {
        bzDefaultPriority = response.parameters.defaultpriority;
        bzDefaultSeverity = response.parameters.defaultseverity;
    });
}

function loadDefaultMilestone() {
    httpGet("/rest/product/" + bzProduct + "?type=enterable&include_fields=default_milestone", function(response) {
        bzDefaultMilestone = response.products[0].default_milestone;
    });
}

function addBoardColumn(status) {
    var div = document.createElement('div');
    div.className = "board-column";
    div.id = status;
    if (isLoggedIn()) {
        div.addEventListener('drag', dragCardStart);
        div.addEventListener('dragend', dragCardEnd);
        div.addEventListener('dragover', dragCardOver);
        div.addEventListener('drop', dropCard);
        div.addEventListener('dragenter', dragCardEnter);
        div.addEventListener('dragleave', dragCardLeave);
    }
    document.getElementById("board").appendChild(div);

    var title = document.createElement('div');
    title.className = "board-column-title";
    title.innerHTML = status;
    document.getElementById(status).appendChild(title);

    var cards = document.createElement('div');
    cards.className = "cards";
    document.getElementById(status).appendChild(cards);

    var prioritycontainer = document.createElement('div');
    prioritycontainer.className = "priorities";
    prioritycontainer.hidden = true;
    document.getElementById(status).appendChild(prioritycontainer);

    var severitycontainer = document.createElement('div');
    severitycontainer.className = "severities";
    severitycontainer.hidden = true;
    document.getElementById(status).appendChild(severitycontainer);
}

function addCard(bug) {
    var card = document.createElement('div');
    card.className = "card";
    card.dataset.bugId = bug.id;

    var buglink = document.createElement('a');
    buglink.href= bzSiteUrl + "/show_bug.cgi?id=" + bug.id;
    buglink.innerHTML = "#" + bug.id;
    buglink.className = "card-ref";

    var summary = document.createElement('div');
    summary.appendChild(document.createTextNode(bug.summary)); // so that we get HTML string escaping for free
    summary.className = "card-summary";

    var meta = document.createElement('div');
    meta.className = "card-meta";
    meta.setAttribute("id", "cardmeta");

    var assignee = document.createElement('span');
    assignee.className = "assignee";

    var fullname = document.createElement('span');
    fullname.className = "fullname";
    fullname.innerHTML = bug.assigned_to_detail.real_name;

    var picture = document.createElement('img');
    picture.setAttribute("id", "picture");
    if (bzShowGravatar) {
        picture.src = getPictureSrc(bug.assigned_to_detail.email);
    } else {
        hidePicture(picture);
    }

    var icons = document.createElement('span');
    icons.setAttribute("id", "icons");

    var comment = document.createElement('span');
    comment.setAttribute("id", "comment");
    comment.style.display = "none";

    var deadline = createDeadlineElement(bug.deadline);

    var priority = document.createElement('span');
    priority.setAttribute("id", "priority");
    priority.innerHTML = bug.priority;
    priority.dataset.priority = bug.priority;

    var severity = document.createElement('span');
    severity.setAttribute("id", "severity");
    severity.innerHTML = bug.severity;
    severity.dataset.severity = bug.severity;

    card.appendChild(buglink);
    card.appendChild(summary);
    card.appendChild(meta);
    meta.appendChild(icons);
    icons.appendChild(priority);
    icons.appendChild(severity);
    icons.appendChild(comment);
    icons.appendChild(deadline);
    assignee.appendChild(fullname);
    assignee.appendChild(picture);
    meta.appendChild(assignee);

    if (isLoggedIn()) {
        card.draggable = "true";
        card.addEventListener('dragstart', dragCard);
    }

    if (bzLoadComments) {
        loadComments(bug);
    }

    document.querySelector("#" + bug.status + " .cards").appendChild(card);

    bzAssignees.set(bug.assigned_to_detail.email, bug.assigned_to_detail); // save for later
}

function createDeadlineElement(deadline) {
    var deadlineElement = document.createElement('span');
    deadlineElement.setAttribute("id", "deadline");

    if (deadline === undefined || deadline === null) {
        deadlineElement.style.display = "none";
        return deadlineElement;
    }

    var month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
    var todayDate = Date.now();
    var cardDate = new Date();
    var dateArray = deadline.split('-');
    cardDate.setFullYear(dateArray[0], dateArray[1] - 1, dateArray[2]);

    var icon = document.createElement('i');
    icon.setAttribute("class", "fa fa-calendar-o fa-sm");
    icon.style.marginRight = "4px";

    var dateText = document.createTextNode(cardDate.getDate() + " " + month[cardDate.getMonth()] + " " + cardDate.getFullYear());

    deadlineElement.appendChild(icon);
    deadlineElement.appendChild(dateText);

    if (cardDate > todayDate) {
        var daysDifference = Math.round((todayDate - cardDate)/(1000*60*60*24));
        if (daysDifference >= -7 && daysDifference <= 0) { // One week out
            deadlineElement.style.color = "orange";
        }
    } else { // Has expired
        deadlineElement.style.color = "red";
    }

    return deadlineElement;
}


function clearCards() {
    document.querySelectorAll(".cards").forEach(function(el) {
        el.innerHTML = "";
    });
    document.querySelectorAll(".board-column-card-count").forEach(function(el) {
        el.innerHTML = "";
    });
}

function clearMilestonesList() {
    var elem = document.getElementById("textMilestone");
    removeChildren(elem);
}

function clearAssigneesList() {
    bzAssignees = new Map();
    var elem = document.getElementById("textAssignee");
    removeChildren(elem);
    elem.setAttribute("disabled", "");
}

function filterByAssignee(name) {
    var cards = document.querySelectorAll(".card");
    cards.forEach(function(card) {
        var fullname = card.querySelector(".fullname").innerHTML;
        if (name == fullname || name == "ALL") {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
    });

    // force reload
    showColumnCounts();
}

function updateUnconfirmedColumnVisibilty() {
    var col = document.querySelector(".board-column#UNCONFIRMED");
    if (col !== null) {
        if (bzProductHasUnconfirmed) {
            col.style.display = "flex";
        } else {
            col.style.display = "none";
        }
    }
}

function httpPut(url, dataObj, successCallback, errorCallback) {
    httpRequest("PUT", url, dataObj, successCallback, errorCallback);
}

function httpGet(url, successCallback, errorCallback) {
    httpRequest("GET", url, "", successCallback, errorCallback);
}

function httpRequest(method, url, dataObj, successCallback, errorCallback) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (xhr.readyState == XMLHttpRequest.DONE) {
            var response = xhr.responseText;
            if (response === "") {
                var msg = "No response from " + bzSiteUrl + " for request " + url;
                console.warn(msg);
                alert(msg);
                return;
            }

            var obj = JSON.parse(response);
            if (xhr.status == 200) {
                return successCallback(obj);
            }

            if (obj.error !== null) {
                hideSpinner();
                switch (obj.code) {
                    case 32000:
                        // auth token has expired
                        localStorage.removeItem(bzSiteUrl);
                        showSignInButton();
                        break;
                }

                console.error(obj.message);

                if (errorCallback !== undefined) {
                    errorCallback(obj);
                } else {
                    alert(obj.message);
                }
            }
        }
    };
    xhr.open(method, bzSiteUrl + url);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.send(JSON.stringify(dataObj));
}

function getURLParameter(parameter) {
    return decodeURIComponent((new RegExp('[?|&]' + parameter + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [, ""])[1].replace(/\+/g, '%20')) || null;
}

function getCardElement(bugId) {
    var bugAttr = '[data-bug-id="' + bugId + '"]';
    return document.querySelector(bugAttr);
}

function showSpinner() {
    var spinner = document.querySelector('#spinner');
    spinner.style.display = 'block';
}

function hideSpinner() {
    var spinner = document.querySelector('#spinner');
    spinner.style.display = 'none';
}

function doAuth(user, password) {
    showSpinner();
    httpGet("/rest/login?login=" + user + "&password=" + password, function(response) {
        hideSpinner();
        bzAuthObject = { 'userID': response.id, 'userToken': response.token };
        localStorage.setItem(bzSiteUrl, JSON.stringify(bzAuthObject));
        loadName();
        // Rebuild the board so dnd events are registered.
        loadBoard();
        hideLoginForm();
    });
}

function isLoggedIn() {
    return bzAuthObject !== null;
}

function showLoginForm() {
    var elem = document.getElementById("loginForm");
    elem.style.display = "inline-block";
    hideSignInButton();
}

function hideLoginForm() {
    var elem = document.getElementById("loginForm");
    elem.style.display = "none";
}

function showSignInButton() {
    document.getElementById("btnSignIn").style.display = "inline-block";
}

function hideSignInButton() {
    document.getElementById("btnSignIn").style.display = "none";
}

function showColumnCounts() {
    var cols = document.querySelectorAll(".board-column");
    cols.forEach(function(col) {
        var cardCount = col.querySelector(".board-column-card-count");
        if (cardCount !== null) {
            cardCount.remove();
        }
        cardCount = document.createElement('span');
        cardCount.className = "board-column-card-count";

        var cards = col.querySelectorAll(".card");
        var count = 0;
        cards.forEach(function(card) {
            // Account for filtered out cards
            if (card.style.display != "none") {
                count++;
            }
        });
        cardCount.innerText += "(" + count + ")";
        var title = col.firstChild;
        title.appendChild(cardCount);
    });
}

function writeBug(bugID, fromStatus, targetStatus, bugResolution, bugPriority, bugSeverity, bugMilestone, bugComment) {
    var dataObj = {
        status: targetStatus,
        resolution : "",
        priority : "",
        severity : "",
        token : bzAuthObject.userToken,
        comment : { body: "" },
        target_milestone : ""
    };

    if (bugResolution !== "") {
        dataObj.resolution = bugResolution;
    } else {
        delete dataObj.resolution;
    }

    if (bugPriority !== "") {
        dataObj.priority = bugPriority;
    } else {
        delete dataObj.priority;
    }

    if (bugMilestone !== "") {
        dataObj.target_milestone = bugMilestone;
    } else {
        delete dataObj.target_milestone;
    }

    if (bugSeverity !== "") {
        dataObj.severity = bugSeverity;
    } else {
        delete dataObj.severity;
    }

    if (bugComment !== "") {
        dataObj.comment.body = bugComment;
    } else if (bzAutoComment) {
        dataObj.comment.body = "Auto-comment from bzKanban";
    } else {
        delete dataObj.comment;
    }

    showSpinner();

    // TODO: maybe check if bugID != number
    httpPut("/rest/bug/" + bugID, dataObj, function() {
        loadBoard();
    });
}

function scheduleCheckForUpdates() {
    window.setTimeout(function() {
        loadCheckForUpdates();
    }, 600000);
}

function dragCardOver(ev) {
    ev.preventDefault();
}

function dragCardEnter(ev) {
    ev.preventDefault();

    var getCardEvData = ev.dataTransfer.getData("text");
    if (getCardEvData) {
        var bugData = JSON.parse(getCardEvData);
        if (bugData.status != ev.currentTarget.id) {
            ev.currentTarget.classList.add("drag-card");
        }
    }

    if (ev.target.classList.contains("drop-target")) {
        ev.target.classList.add("drop-target-hover");
    }
}

function dragCardLeave(ev) {
    ev.currentTarget.classList.remove("drag-card");

    if (ev.target.classList.contains("drop-target")) {
        ev.target.classList.remove("drop-target-hover");
    }
}

function dragCard(ev) {
    var fromStatus = ev.target.parentElement.id;

    // Disable pointer-events for all other cards so that we
    // can reliably detect when a card enters and leaves a column.
    var cards = document.querySelectorAll(".card");
    cards.forEach(function(card) {
        if (card.id != ev.currentTarget.id) {
            card.style.pointerEvents = "none";
        }
    });

    var bugID = ev.currentTarget.dataset.bugId;
    var bugData = {"id": bugID, "status": fromStatus};
    ev.dataTransfer.setData("text", JSON.stringify(bugData));
}

function dragCardStart(ev) {
    columnTitle = ev.currentTarget.childNodes[0].childNodes[0].data;
    if (!(columnTitle == "UNCONFIRMED" || columnTitle == "VERIFIED")) {
        showResolutions(document.getElementById("RESOLVED"));
        showPriorities(document.getElementById(columnTitle));
        showSeverities(document.getElementById(columnTitle));
    }
    showBacklog();
}

function dragCardEnd(ev) {
    columnTitle = ev.currentTarget.childNodes[0].childNodes[0].data;
    if (!(columnTitle == "UNCONFIRMED" || columnTitle == "VERIFIED")) {
        hideResolutions(document.getElementById("RESOLVED"));
        hidePriorities(document.getElementById(columnTitle));
        hideSeverities(document.getElementById(columnTitle));
    }
    hideBacklog();
}

function dropCard(ev) {
    // Re-enable pointer events for all cards.
    var cards = document.querySelectorAll(".card");
    cards.forEach(function(card) {
        card.style.pointerEvents = "auto";
    });

    ev.currentTarget.classList.remove("drag-card");

    ev.preventDefault();

    var bugData = JSON.parse(ev.dataTransfer.getData("text"));

    var targetStatus = ev.currentTarget.id;
    var targetResolution = "";
    var targetPriority = "";
    var targetSeverity = "";
    var targetComment = "";

    if (ev.target.classList.contains("resolution")) {
        targetResolution = ev.target.id;
    } else if (ev.target.classList.contains("priority")) {
        targetPriority = ev.target.id;
    } else if (ev.target.classList.contains("severity")) {
        targetSeverity = ev.target.id;
    }

    ev.target.classList.remove("drop-target-hover");

    if (bzAddCommentOnChange) {
        showCommentModal(bugData.id, function(comment) {
            targetComment = comment;
            writeBug(bugData.id, bugData.status, targetStatus, targetResolution, targetPriority, targetSeverity, "", targetComment);
        });
    } else {
        writeBug(bugData.id, bugData.status, targetStatus, targetResolution, targetPriority, targetSeverity, "", targetComment);
    }
}

function dropBacklog(ev) {
    if (ev.target.classList.contains("drop-target")) {
        ev.target.classList.remove("drop-target-hover");
    }
    ev.preventDefault();

    var bugData = JSON.parse(ev.dataTransfer.getData("text"));

    var targetStatus = "CONFIRMED";
    var targetResolution = "";
    var targetPriority = bzDefaultPriority;
    var targetSeverity = "";
    var targetComment = "";

    if (bzAddCommentOnChange) {
        showCommentModal(bugData.id, function(comment) {
            targetComment = comment;
            writeBug(bugData.id, bugData.status, targetStatus, targetResolution, targetPriority, targetSeverity, bzDefaultMilestone, targetComment);
        });
    } else {
            writeBug(bugData.id, bugData.status, targetStatus, targetResolution, targetPriority, targetSeverity, bzDefaultMilestone, targetComment);
    }

}

function showResolutions(elem) {
    var resolutions = elem.querySelectorAll(".resolutions");
    resolutions.forEach(function(res) {
        res.hidden = false;
    });
    hideCards(elem);
}

function hideResolutions(elem) {
    var resolutions = elem.querySelectorAll(".resolutions");
    resolutions.forEach(function(resolution) {
        resolution.hidden = true;
    });
    showCards(elem);
}

function showPriorities(elem) {
    var priorities = elem.querySelectorAll(".priorities");
    priorities.forEach(function(priority) {
        priority.hidden = false;
    });
    hideCards(elem);
}

function hidePriorities(elem) {
    var priorities = elem.querySelectorAll(".priorities");
    priorities.forEach(function(priority) {
        priority.hidden = true;
    });
    showCards(elem);
}

function showSeverities(elem) {
    var severities = elem.querySelectorAll(".severities");
    severities.forEach(function(severity) {
        severity.hidden = false;
    });
    hideCards(elem);
}

function hideSeverities(elem) {
    var severities = elem.querySelectorAll(".severities");
    severities.forEach(function(severity) {
        severity.hidden = true;
    });
    showCards(elem);
}

function showCards(elem) {
    var cards = elem.querySelectorAll(".card");
    cards.forEach(function(card) {
        card.style.display = "block";
    });
}

function hideCards(elem) {
    var cards = elem.querySelectorAll(".card");
    cards.forEach(function(card) {
        card.style.display = "none";
    });
}

function showBacklog() {
    document.getElementById("textBacklog").style.display = "inline-block";
}

function hideBacklog() {
    document.getElementById("textBacklog").style.display = "none";
}

function isTrue(string) {
    return (string === 'true');
}

function removeChildren(elem) {
    while (elem.firstChild) {
        elem.removeChild(elem.firstChild);
    }
}

function getPictureSrc(email) {
    var hash = CryptoJS.MD5(email);
    var hashString = hash.toString(CryptoJS.enc.Base64);

    if (hashString !== "") {
        return ('https://www.gravatar.com/avatar/' + hashString + '?s=20&d=blank');
    }
}

function hidePicture(pictureobject) {
    pictureobject.style.display = "none";
}

function updateAddressBar() {
    var currentURL = location.href;
    var newURL = currentURL.split("?")[0]; // trim off params
    newURL += "?product=" + bzProduct;
    newURL += "&milestone=" + bzProductMilestone;
    newURL += "&assignee=" + bzAssignedTo;
    newURL += "&gravatar=" + bzShowGravatar;
    newURL += "&comments=" + bzLoadComments;
    newURL += "&autocomment=" + bzAutoComment;
    newURL += "&autorefresh=" + bzAutoRefresh;
    newURL += "&site=" + bzSiteUrl;

    history.pushState({}, '', newURL);
}

function showNewBugModal() {
    var modal = document.createElement("div");
    modal.id = "modalNewBug";
    modal.className = "modal";

    var content = document.createElement("div");
    content.className = "modal-content";

    var header = document.createElement("div");
    header.className = "modal-header";
    header.innerText = "Add new bug to milestone " + bzProductMilestone;

    var close = document.createElement("i");
    close.className = "fa fa-close modalClose";
    close.onclick = function() {
        hideNewBugModal();
    };

    header.appendChild(close);

    var body = document.createElement("div");
    body.className = "modal-body";

    var summaryLabel = document.createElement("label");
    summaryLabel.innerText = "Summary";
    var summary = document.createElement("input");
    summary.id = "textAddBugSummary";
    summary.name = "summary";
    summary.type = "text";
    summaryLabel.appendChild(summary);

    var descriptionLabel = document.createElement("label");
    descriptionLabel.innerText = "Description";
    var description = document.createElement("textarea");
    description.id = "textAddBugDescription";
    description.name = "description";
    descriptionLabel.appendChild(description);

    var componentLabel = document.createElement("label");
    componentLabel.innerText = "Component";
    var components = document.createElement("select");
    components.id = "textComponent";
    components.name = "component";
    componentLabel.appendChild(components);

    var versionLabel = document.createElement("label");
    versionLabel.innerText = "Version";
    var versions = document.createElement("select");
    versions.id = "textVersion";
    versions.name = "version";
    versionLabel.appendChild(versions);

    var submit = document.createElement("button");
    submit.innerText = "Submit";
    submit.id = "submitNewBug";
    submit.onclick = function() {
        var dataObj = {
            product: bzProduct,
            component: document.getElementById("textComponent").value,
            summary: document.getElementById("textAddBugSummary").value,
            description: document.getElementById("textAddBugDescription").value,
            version: document.getElementById("textVersion").value,
            // Bugzilla web CGI kicks in if opsys and platform default is blank
            // doing code to detect through the browser.
            // TODO: Write js detection code if blank is detected
            op_sys: "ALL",
            platform: "ALL",
            target_milestone: bzProductMilestone
        };

        showSpinner();

        httpRequest("POST", "/rest/bug?token=" + bzAuthObject.userToken, dataObj, function() {
            loadBoard();
        });

        hideNewBugModal();
    };

    body.appendChild(summaryLabel);
    body.appendChild(descriptionLabel);
    body.appendChild(componentLabel);
    body.appendChild(versionLabel);
    body.appendChild(submit);

    content.appendChild(header);
    content.appendChild(body);
    modal.appendChild(content);

    bzProductComponents.forEach(function(component) {
        var opt = document.createElement('option');
        opt.innerText = component;
        opt.value = component;
        components.appendChild(opt);
    });

    bzProductVersions.forEach(function(version) {
        var opt = document.createElement('option');
        opt.innerText = version;
        opt.value = version;
        versions.appendChild(opt);
    });

    document.querySelector("body").appendChild(modal);

    modal.style.display = "block";
}

function hideNewBugModal() {
    document.querySelector('#modalNewBug').remove();
}

function showCommentModal(bugId, responseCallback) {
    var commentModal = document.createElement("div");
    commentModal.id = "modalComment";
    commentModal.className = "modal";

    var commentModalContent = document.createElement("div");
    commentModalContent.className = "modal-content";

    var bugTitle = document.querySelector(".card[data-bug-id='" + bugId + "'] > .card-summary").innerText;

    var commentModalHeader = document.createElement("div");
    commentModalHeader.className = "modal-header";
    commentModalHeader.innerText = "Bug " + bugId + ': ' + bugTitle;

    var close = document.createElement("i");
    close.className = "fa fa-close modalClose";
    close.onclick = function() {
        hideCommentModal();
    };

    commentModalHeader.appendChild(close);

    var commentModalBody = document.createElement("div");
    commentModalBody.className = "modal-body";

    var commentBoxLabel = document.createElement("label");
    commentBoxLabel.innerText = "Additional Comments";

    var commentBox = document.createElement("textarea");
    commentBox.id = "commentBoxText"

    commentBoxLabel.appendChild(commentBox);

    var submit = document.createElement("button");
    submit.innerText = "Submit";
    submit.id = "submitComment";
    submit.onclick = function() {
        var comment = document.querySelector("#commentBoxText").value;
        responseCallback(comment);
        hideCommentModal();
    }

    commentModalBody.appendChild(commentBoxLabel);
    commentModalBody.appendChild(submit);

    commentModalContent.appendChild(commentModalHeader);
    commentModalContent.appendChild(commentModalBody);
    commentModal.appendChild(commentModalContent);

    document.querySelector("body").appendChild(commentModal);

    commentModal.style.display = "block";
}

function hideCommentModal() {
    document.querySelector('#modalComment').remove();
}

// Register event handlers

// Background checking for updates to visible cards
document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
        bzCheckForUpdates = false;
    } else {
        bzCheckForUpdates = true;
        loadCheckForUpdates();
    }
    });


// When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
    document.querySelectorAll('.modal').forEach(function(el) {
        if (event.target == el) {
            el.style.display = "none";
        }
    });
};
