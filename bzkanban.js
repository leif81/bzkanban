// Configuration options.
var bzSiteUrl = "http://bugzilla.msec.local";
var bzOrder = "priority,bug_severity,assigned_to";
var bzAllowEditBugs = true;
var bzShowGravatar = true;
var bzAddCommentOnChange = true;
var bzLoadComments = false;
var bzAutoComment = false;
var bzCheckForUpdates = true;
var bzAutoRefresh = false;
var bzDomElement = "#bzkanban";

// "Private" global variables. Do not touch.
var bzProduct = "";
var bzProductMilestone = "";
var bzComponent = "";
var bzPriority = "";
var bzAssignedTo = "";
var bzUserFullName = "";
var bzProductHasUnconfirmed = false;
var bzBoardLoadTime = "";
var bzRestGetBugsUrl = "";
var bzAssignees = new Map();
var bzProductComponents;
var bzProductVersions;
var bzProductResolutions;
var bzProductPriorities;
var bzProductSeverities;
var bzDefaultPriority;
var bzDefaultSeverity;
var bzDefaultMilestone;
var bzAuthObject;

function initBzkanban() {
    loadParams();
    initNav();
    initBoard();
}

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

    bzAuthObject = JSON.parse(localStorage.getItem(bzSiteUrl));
}

function initNav() {
    var nav = document.createElement("div");
    nav.id = "nav";
    document.querySelector(bzDomElement).appendChild(nav);

    initQueryFields();
    if (bzAllowEditBugs) {
        initBacklogTarget();
    }

    var spring = document.createElement("span");
    spring.className = "spring";
    nav.appendChild(spring);

    initSpinner();
    initActions();
    initLoginForm();

    if (isLoggedIn()) {
        loadName();
        hideSignInButton();
    }

    loadProductsList();

    if (bzProduct !== null) {
        loadMilestonesList();
    }
}

function initBoard() {
    var board = document.createElement("div");
    board.id = "board";
    document.querySelector(bzDomElement).appendChild(board);

    loadProductInfo();
    loadColumns();
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
        hideNewBugButton();
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
        showNewBugButton();

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
    newbug.id = "btnCreate";
    newbug.innerText = "New Bug";
    newbug.style.display = "none";
    newbug.addEventListener("click", function() {
        if (isLoggedIn()) {
            showNewBugModal();
        } else {
            // Open Bugzilla page
            window.open(bzSiteUrl + "/enter_bug.cgi?product=" + bzProduct + "&target_milestone=" + bzProductMilestone);
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
    bzRestGetBugsUrl += "&include_fields=summary,status,resolution,id,severity,priority,assigned_to,last_updated,deadline";
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

        // used for populating New Bug modal
        if (isLoggedIn()) {
            loadDefaultMilestone();
            loadComponentsList();
            loadVersionsList();
        }
    }
}

function loadColumns() {
    httpGet("/rest/field/bug/status/values", function(response) {
        var statuses = response.values;
        statuses.forEach(function(status) {
            addBoardColumn(status);
        });
        updateUnconfirmedColumnVisibilty();

        if (bzProduct !== null && bzProductMilestone !== null) {
            loadBoard();
            showNewBugButton();
        }

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
    httpGet("/rest/user/" + bzAuthObject.userID, function(response) {
        bzUserFullName = response.users[0].real_name;
        if (bzUserFullName !== null) {
            document.getElementById("whoami").textContent = bzUserFullName;
        }
    });
}

function loadResolutions() {
    bzProductResolutions = new Set();
    httpGet("/rest/field/bug/resolution", function(response) {
        var arrayResolutions = response.fields;
        arrayResolutions[0].values.forEach(function(resolution) {
            var resolutionName = resolution.name;
            if (resolutionName === "") {
                return;
            }
            bzProductResolutions.add(resolutionName);
        });
    });
}

function loadPriorities() {
    bzProductPriorities = new Set();
    httpGet("/rest/field/bug/priority", function(response) {
        var arrayPriorities = response.fields;
        arrayPriorities[0].values.forEach(function(priority) {
            var priorityName = priority.name;
            if (priorityName === "") {
                return;
            }
            bzProductPriorities.add(priorityName);
        });
    });
}

function loadSeverities() {
    bzProductSeverities = new Set();
    httpGet("/rest/field/bug/bug_severity", function(response) {
        var arraySeverities = response.fields;
        arraySeverities[0].values.forEach(function(severity) {
            var severityName = severity.name;
            if (severityName === "") {
                return;
            }
            bzProductSeverities.add(severityName);
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
    httpGet("/rest/parameters", function(response) {
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
    if (isLoggedIn() && bzAllowEditBugs) {
        div.addEventListener('drag', dragCardStart);
        div.addEventListener('dragend', dragCardEnd);
        div.addEventListener('dragover', dragCardOver);
        div.addEventListener('drop', dropCard);
        div.addEventListener('dragenter', dragCardEnter);
        div.addEventListener('dragleave', dragCardLeave);
    }

    var title = document.createElement('div');
    title.className = "board-column-title";
    title.innerHTML = status;
    div.appendChild(title);

    var content = document.createElement('div');
    content.className = "board-column-content";
    div.appendChild(content);

    var cards = document.createElement('div');
    cards.className = "cards";
    content.appendChild(cards);

    var prioritycontainer = document.createElement('div');
    prioritycontainer.className = "priorities";
    prioritycontainer.hidden = true;
    content.appendChild(prioritycontainer);

    var severitycontainer = document.createElement('div');
    severitycontainer.className = "severities";
    severitycontainer.hidden = true;
    content.appendChild(severitycontainer);

    document.getElementById("board").appendChild(div);
}

function addCard(bug) {
    var card = document.createElement('div');
    card.className = "card";
    card.dataset.bugId = bug.id;
    card.dataset.bugStatus = bug.status;
    card.dataset.bugPriority = bug.priority;
    card.dataset.bugSeverity = bug.severity;
    card.dataset.bugResolution = bug.resolution;
    card.onclick = function() {
        var bugObject = {};
        bugObject.id = bug.id;
        bugObject.status = bug.status;
        bugObject.priority = bug.priority;
        bugObject.severity = bug.severity;
        bugObject.resolution = bug.resolution;
        showBugModal(bugObject, bugObject);
    }

    var buglink = document.createElement('a');
    buglink.href= bzSiteUrl + "/show_bug.cgi?id=" + bug.id;
    buglink.innerHTML = "#" + bug.id;
    buglink.className = "card-ref";
    buglink.onclick = function(ev) {
        // On click follow href link.
        // And prevent event propagation up to card click handler, which would cause modal to be shown.
        ev.stopPropagation();
    }

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

    if (isLoggedIn() && bzAllowEditBugs) {
        card.draggable = "true";
        card.addEventListener('dragstart', dragCard);
        card.style.cursor = "pointer";
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

function removeBoard() {
    document.querySelector("#board").remove();
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

    // Append login token to every request.
    // Becase some Bugzilla instances require auth for even viewing bugs, etc.
    if (bzAuthObject !== null ) {
        if (url.indexOf('?') == -1) {
            url += "?";
        } else {
            url += "&";
        }

        url += "token=" + bzAuthObject.userToken
    }

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

function showNewBugButton() {
    var btn = document.querySelector('#btnCreate')
    btn.style.display = 'initial';
}

function hideNewBugButton() {
    var btn = document.querySelector('#btnCreate')
    btn.style.display = 'none';
}

function doAuth(user, password) {
    showSpinner();
    hideLoginForm();
    httpGet("/rest/login?login=" + user + "&password=" + password, function(response) {
        bzAuthObject = { 'userID': response.id, 'userToken': response.token };
        localStorage.setItem(bzSiteUrl, JSON.stringify(bzAuthObject));
        loadName();
        // Rebuild the board so dnd events are registered.
        removeBoard();
        initBoard();
    }, function(error) {
        // Login failed.
        showSignInButton();
        alert(error.message);
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

function writeBug(dataObj) {
    if (dataObj.comment.body === "" && bzAutoComment) {
        dataObj.comment = {};
        dataObj.comment.body = "Auto-comment from bzKanban";
    }

    dataObj.token = bzAuthObject.userToken,

    showSpinner();

    httpPut("/rest/bug/" + dataObj.id, dataObj, function() {
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

    if (ev.target.classList.contains("board-column")) {
        ev.currentTarget.classList.add("drag-card");
    }

    if (ev.target.classList.contains("drop-target")) {
        ev.target.classList.add("drop-target-hover");
    }
}

function dragCardLeave(ev) {
    if (ev.target.classList.contains("board-column")) {
        ev.currentTarget.classList.remove("drag-card");
    }

    if (ev.target.classList.contains("drop-target")) {
        ev.target.classList.remove("drop-target-hover");
    }
}

function dragCard(ev) {
    // Disable pointer-events for all other cards so that we
    // can reliably detect when a card enters and leaves a column.
    var cards = document.querySelectorAll(".card");
    cards.forEach(function(card) {
        if (card.dataset.bugId != ev.currentTarget.dataset.bugId) {
            card.style.pointerEvents = "none";
        }
    });

    var card = ev.currentTarget;
    var bugID = card.dataset.bugId;
    var bugData = {
        "id": bugID,
        "status": card.dataset.bugStatus,
        "priority": card.dataset.bugPriority,
        "severity": card.dataset.bugSeverity
    };
    ev.dataTransfer.setData("text", JSON.stringify(bugData));
}

function dragCardStart(ev) {
    showBacklog();
}

function dragCardEnd(ev) {
    // Re-enable pointer events for all cards.
    var cards = document.querySelectorAll(".card");
    cards.forEach(function(card) {
        card.style.pointerEvents = "auto";
    });

    hideBacklog();
}

function dropCard(ev) {
    var col = ev.currentTarget;
    col.classList.remove("drag-card");

    ev.preventDefault();

    var bugCurrent = JSON.parse(ev.dataTransfer.getData("text"));

    var bugUpdate = {};
    bugUpdate.id = bugCurrent.id;
    bugUpdate.status = ev.currentTarget.id;

    ev.target.classList.remove("drop-target-hover");

    if (bzAddCommentOnChange) {
        showBugModal(bugCurrent, bugUpdate);
    } else {
        writeBug(bugUpdate);
    }
}

function dropBacklog(ev) {
    if (ev.target.classList.contains("drop-target")) {
        ev.target.classList.remove("drop-target-hover");
    }
    ev.preventDefault();

    var bugCurrent = JSON.parse(ev.dataTransfer.getData("text"));

    var bugUpdate = {};
    bugUpdate.id = bugCurrent.id;
    bugUpdate.status = "CONFIRMED";
    bugUpdate.priority = bzDefaultPriority;

    if (bzAddCommentOnChange) {
        showBugModal(bugCurrent, bugUpdate);
    } else {
        writeBug(bugUpdate);
    }
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

        httpRequest("POST", "/rest/bug", dataObj, function() {
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

    document.querySelector(bzDomElement).appendChild(modal);
}

function hideNewBugModal() {
    document.querySelector('#modalNewBug').remove();
}

function showBugModal(bugCurrent, bugUpdate) {
    var commentModal = document.createElement("div");
    commentModal.id = "modalBug";
    commentModal.className = "modal";

    var commentModalContent = document.createElement("div");
    commentModalContent.className = "modal-content";

    var card = document.querySelector(".card[data-bug-id='" + bugCurrent.id + "']");
    var bugTitle = card.querySelector(".card-summary").innerText;

    var commentModalHeader = document.createElement("div");
    commentModalHeader.className = "modal-header";
    commentModalHeader.innerText = "#" + bugCurrent.id + " " + bugTitle;

    var close = document.createElement("i");
    close.className = "fa fa-close modalClose";
    close.onclick = function() {
        hideBugModal();
    };

    commentModalHeader.appendChild(close);

    var commentModalBody = document.createElement("div");
    commentModalBody.className = "modal-body";

    // Card was dragged
    if (bugCurrent.status !== bugUpdate.status) {
        // TODO show what's changed in modal as confirmation?
        console.log("Bug " + bugCurrent.id + " moved from " + bugCurrent.status + " to " + bugUpdate.status);
    }

    // TODO replace hard coded column name somehow.
    if (bugUpdate.status === "RESOLVED") {
        //  Resolution field.
        var resolutionLabel = document.createElement("label");
        resolutionLabel.innerText = "Resolution";
        var resolutions = document.createElement("select");
        resolutions.name = "resolution";
        resolutionLabel.appendChild(resolutions);

        bzProductResolutions.forEach(function(resolution) {
            var opt = document.createElement('option');
            opt.innerText = resolution;
            opt.value = resolution;
            if (resolution === bugCurrent.resolution) {
                opt.selected = true;
            }
            resolutions.appendChild(opt);
        });

        // Set to default value, and add change listener
        bugUpdate.resolution = resolutions.value;
        resolutions.onchange = function() {
            bugUpdate.resolution = resolutions.value;
        }

        commentModalBody.appendChild(resolutionLabel);
    }

    // Card was clicked
    if (bugCurrent.status === bugUpdate.status) {

        // TODO show bug description?
        // TODO show bug comments?

        // Priority field.
        var priorityLabel = document.createElement("label");
        priorityLabel.innerText = "Priority";
        var priorities = document.createElement("select");
        priorities.name = "priority";
        priorityLabel.appendChild(priorities);

        bzProductPriorities.forEach(function(priority) {
            var opt = document.createElement('option');
            opt.innerText = priority;
            opt.value = priority;
            if (priority === bugCurrent.priority) {
                opt.selected = true;
            }
            priorities.appendChild(opt);
        });

        // Set to default value, and add change listener
        bugUpdate.priority = priorities.value;
        priorities.onchange = function() {
            bugUpdate.priority = priorities.value;
        }

        commentModalBody.appendChild(priorityLabel);

        // Severity field.
        var severityLabel = document.createElement("label");
        severityLabel.innerText = "Severity";
        var severities = document.createElement("select");
        severities.name = "severity";
        severityLabel.appendChild(severities);

        bzProductSeverities.forEach(function(severity) {
            var opt = document.createElement('option');
            opt.innerText = severity;
            opt.value = severity;
            if (severity === bugCurrent.severity) {
                opt.selected = true;
            }
            severities.appendChild(opt);
        });

        // Set to default value, and add change listener
        bugUpdate.severity = severities.value;
        severities.onchange = function() {
            bugUpdate.severity = severities.value;
        }

        commentModalBody.appendChild(severityLabel);
    }

    var commentBoxLabel = document.createElement("label");
    commentBoxLabel.innerText = "Additional Comments";

    var commentBox = document.createElement("textarea");
    commentBox.id = "commentBoxText"

    commentBoxLabel.appendChild(commentBox);

    var submit = document.createElement("button");
    submit.innerText = "Submit";
    submit.id = "submitComment";
    submit.onclick = function() {
        bugUpdate.comment = {};
        bugUpdate.comment.body = document.querySelector("#commentBoxText").value;
        hideBugModal();
        writeBug(bugUpdate);
    }

    commentModalBody.appendChild(commentBoxLabel);
    commentModalBody.appendChild(submit);

    commentModalContent.appendChild(commentModalHeader);
    commentModalContent.appendChild(commentModalBody);
    commentModal.appendChild(commentModalContent);

    document.querySelector(bzDomElement).appendChild(commentModal);
}

function hideBugModal() {
    document.querySelector('#modalBug').remove();
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
